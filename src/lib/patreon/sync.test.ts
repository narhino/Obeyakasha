import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  entitlements,
  patreonLinks,
  tierMappings,
  users,
} from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { clearSettingsCache, getRawSetting } from "@/lib/settings";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { syncPatreonUser } from "./sync";

/**
 * Integration test for the M0 DoD: signing in with Patreon discovers tiers,
 * writes the link + entitlement, and the entitlement resolver reflects the
 * mapped access level. Patreon HTTP is mocked at the fetch layer.
 */

const CAMPAIGN_ID = "camp_123";

function campaignsResponse() {
  return {
    data: [{ id: CAMPAIGN_ID, type: "campaign", attributes: {} }],
    included: [
      {
        id: "tier_bronze",
        type: "tier",
        attributes: { title: "Acolyte", amount_cents: 500, patron_count: 40 },
      },
      {
        id: "tier_gold",
        type: "tier",
        attributes: { title: "Devoted", amount_cents: 2500, patron_count: 12 },
      },
    ],
  };
}

function identityResponse(opts: {
  patreonUserId: string;
  tierIds: string[];
  patronStatus: string | null;
}) {
  return {
    data: {
      id: opts.patreonUserId,
      type: "user",
      attributes: { email: "sub@example.com", full_name: "A Subject" },
      relationships: { memberships: { data: [{ id: "member_1", type: "member" }] } },
    },
    included: [
      {
        id: "member_1",
        type: "member",
        attributes: { patron_status: opts.patronStatus },
        relationships: {
          campaign: { data: { id: CAMPAIGN_ID, type: "campaign" } },
          currently_entitled_tiers: {
            data: opts.tierIds.map((id) => ({ id, type: "tier" })),
          },
        },
      },
    ],
  };
}

/** Route the mocked fetch by URL. */
function mockFetch(
  handler: (url: string) => unknown,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      return {
        ok: true,
        status: 200,
        json: async () => handler(url),
        text: async () => "",
      } as Response;
    }),
  );
}

async function makeUser(): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email: "sub@example.com", role: "subject" })
    .returning();
  return u!.id;
}

beforeEach(async () => {
  await truncateAll();
  clearSettingsCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncPatreonUser (M0)", () => {
  it("goddess sign-in discovers campaign tiers into settings", async () => {
    const uid = await makeUser();
    mockFetch((url) =>
      url.includes("/campaigns")
        ? campaignsResponse()
        : identityResponse({
            patreonUserId: "patreon_admin",
            tierIds: [],
            patronStatus: null,
          }),
    );

    await syncPatreonUser({ userId: uid, accessToken: "tok", isGoddess: true });

    const tiers = await getRawSetting<{ id: string; title: string }[]>(
      "patreon_campaign_tiers",
      [],
    );
    expect(tiers.map((t) => t.id)).toEqual(["tier_bronze", "tier_gold"]);
    const campaignId = await getRawSetting<string | null>(
      "patreon_campaign_id",
      null,
    );
    expect(campaignId).toBe(CAMPAIGN_ID);
  });

  it("active patron sync writes link + entitlement; resolver reflects mapped level", async () => {
    // Given a mapping gold→level 3. The sync (isGoddess) discovers the campaign.
    await db
      .insert(tierMappings)
      .values({ patreonTierId: "tier_gold", label: "Devoted", accessLevel: 3 });

    const uid = await makeUser();
    mockFetch((url) =>
      url.includes("/campaigns")
        ? campaignsResponse()
        : identityResponse({
            patreonUserId: "patreon_sub",
            tierIds: ["tier_gold"],
            patronStatus: "active_patron",
          }),
    );

    await syncPatreonUser({ userId: uid, accessToken: "tok", isGoddess: true });

    const link = await db
      .select()
      .from(patreonLinks)
      .where(eq(patreonLinks.userId, uid));
    expect(link[0]?.patreonUserId).toBe("patreon_sub");
    expect(link[0]?.currentlyEntitledTierIds).toEqual(["tier_gold"]);
    expect(link[0]?.patronStatus).toBe("active_patron");

    const ent = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, uid));
    expect(ent[0]?.status).toBe("active");

    const access = await resolveAccess(uid);
    expect(access.accessLevel).toBe(3);
    expect(access.frozen).toBe(false);

    const audits = await db.select().from(auditLog);
    expect(audits.some((a) => a.action === "patreon.sync")).toBe(true);
  });

  it("declined patron → grace with a grace window", async () => {
    await db
      .insert(tierMappings)
      .values({ patreonTierId: "tier_gold", label: "Devoted", accessLevel: 3 });
    const uid = await makeUser();
    mockFetch((url) =>
      url.includes("/campaigns")
        ? campaignsResponse()
        : identityResponse({
            patreonUserId: "patreon_sub2",
            tierIds: ["tier_gold"],
            patronStatus: "declined_patron",
          }),
    );

    await syncPatreonUser({ userId: uid, accessToken: "tok", isGoddess: true });

    const ent = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, uid));
    expect(ent[0]?.status).toBe("grace");
    expect(ent[0]?.graceUntil).toBeInstanceOf(Date);

    // Grace keeps access.
    const access = await resolveAccess(uid);
    expect(access.accessLevel).toBe(3);
    expect(access.inGrace).toBe(true);
  });

  it("former patron → frozen, access sealed", async () => {
    await db
      .insert(tierMappings)
      .values({ patreonTierId: "tier_gold", label: "Devoted", accessLevel: 3 });
    const uid = await makeUser();
    mockFetch((url) =>
      url.includes("/campaigns")
        ? campaignsResponse()
        : identityResponse({
            patreonUserId: "patreon_sub3",
            tierIds: [],
            patronStatus: "former_patron",
          }),
    );

    await syncPatreonUser({ userId: uid, accessToken: "tok", isGoddess: true });

    const access = await resolveAccess(uid);
    expect(access.frozen).toBe(true);
    expect(access.accessLevel).toBe(0);
  });
});
