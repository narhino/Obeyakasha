import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, entitlements, patreonLinks, users } from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { selfHeal } from "./selfheal";

async function member(opts: {
  status: "active" | "grace" | "frozen";
  syncedMinutesAgo: number | null;
  linked?: boolean;
  token?: boolean;
}): Promise<string> {
  const [u] = await db.insert(users).values({ role: "subject" }).returning();
  await db.insert(entitlements).values({
    userId: u!.id,
    source: "patreon",
    accessLevel: 1,
    status: opts.status,
  });
  if (opts.linked !== false) {
    await db.insert(patreonLinks).values({
      userId: u!.id,
      patreonUserId: `p-${u!.id.slice(0, 8)}`,
      lastSyncedAt:
        opts.syncedMinutesAgo === null
          ? null
          : new Date(Date.now() - opts.syncedMinutesAgo * 60_000),
    });
  }
  if (opts.token) {
    await db.insert(accounts).values({
      userId: u!.id,
      type: "oauth",
      provider: "patreon",
      providerAccountId: `p-${u!.id.slice(0, 8)}`,
      access_token: "tok",
      // Far future, so no refresh is attempted in a test.
      expires_at: Math.floor(Date.now() / 1000) + 86_400,
    });
  }
  return u!.id;
}

beforeEach(async () => {
  await truncateAll();
});

describe("re-checking a member who already paid", () => {
  it("leaves a healthy, recently-synced member alone", async () => {
    const A = await member({ status: "active", syncedMinutesAgo: 5, token: true });
    const r = await selfHeal(A);
    expect(r.checked).toBe(false);
    expect(r.frozen).toBe(false);
  });

  it("does not re-check a frozen member more than once every couple of minutes", async () => {
    // A frozen member synced 1 minute ago: still inside the window.
    const A = await member({ status: "frozen", syncedMinutesAgo: 1, token: true });
    expect((await selfHeal(A)).checked).toBe(false);
  });

  it("chases a frozen member far harder than a healthy one — being wrong costs them", async () => {
    // 30 minutes: past the frozen window, nowhere near the healthy one.
    const frozen = await member({ status: "frozen", syncedMinutesAgo: 30 });
    const active = await member({ status: "active", syncedMinutesAgo: 30 });
    // Neither has a usable token here, so neither completes — but the frozen one
    // got as far as looking for one, which is the decision under test.
    expect((await selfHeal(frozen)).frozen).toBe(true);
    expect((await selfHeal(active)).frozen).toBe(false);

    // The window itself: a frozen member 30 minutes stale is due, a healthy one
    // is not. Proven through lastSyncedAt, which only a real check would stamp.
    const [f] = await db
      .select({ at: patreonLinks.lastSyncedAt })
      .from(patreonLinks)
      .where(eq(patreonLinks.userId, frozen));
    expect(f!.at).not.toBeNull();
  });

  it("says nothing to do when they were never linked to Patreon at all", async () => {
    const A = await member({ status: "frozen", syncedMinutesAgo: null, linked: false });
    const r = await selfHeal(A);
    expect(r.checked).toBe(false);
    expect(r.frozen).toBe(true);
    // And it did not invent a link row for them.
    const rows = await db
      .select()
      .from(patreonLinks)
      .where(eq(patreonLinks.userId, A));
    expect(rows).toHaveLength(0);
  });

  it("reads standing from the patreon entitlement, not some other source", async () => {
    const A = await member({ status: "frozen", syncedMinutesAgo: 1, token: true });
    // A live grant alongside it must not make the patreon side look healthy.
    await db.insert(entitlements).values({
      userId: A,
      source: "grant",
      accessLevel: 3,
      status: "active",
    });
    expect((await selfHeal(A)).frozen).toBe(true);
    const [row] = await db
      .select({ s: entitlements.status })
      .from(entitlements)
      .where(and(eq(entitlements.userId, A), eq(entitlements.source, "patreon")));
    expect(row!.s).toBe("frozen");
  });
});
