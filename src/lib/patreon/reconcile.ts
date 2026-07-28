import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { patreonLinks } from "@/lib/db/schema";
import { writePatreonEntitlement } from "@/lib/entitlements/resolve";
import { getRawSetting, getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { fetchCampaignMembers, type PatronStatus } from "./client";

/**
 * Re-read the whole campaign from Patreon and fix everyone's standing.
 *
 * THE BUG THIS EXISTS FOR: entitlements were only ever recomputed inside
 * `syncPatreonUser`, which runs at sign-in and nowhere else. A member who
 * re-pledged on Patreon therefore stayed `frozen` in here indefinitely —
 * their session cookie was still valid, so they never signed in again, so
 * nothing ever re-checked. They had paid and were still locked out, and the
 * app had no idea. Nothing in the product could self-heal that.
 *
 * Reading the campaign roster with HER creator token (rather than each
 * subject's own token) is what makes it work for people who never return to
 * the app, and avoids refreshing dozens of expiring per-user tokens.
 */

function lifecycleFor(status: PatronStatus) {
  switch (status) {
    case "active_patron":
      return "active" as const;
    case "declined_patron":
      return "grace" as const;
    default:
      return "frozen" as const; // former_patron / null
  }
}

export interface ReconcileResult {
  ok: boolean;
  reason?: "no_token" | "no_campaign" | "failed";
  members: number;
  matched: number;
  changed: number;
  /** Subjects whose access came BACK — the ones this was built for. */
  restored: number;
}

const EMPTY: ReconcileResult = {
  ok: false,
  members: 0,
  matched: 0,
  changed: 0,
  restored: 0,
};

export async function reconcilePatreon(): Promise<ReconcileResult> {
  const token = env.PATREON_CREATOR_ACCESS_TOKEN;
  if (!token) return { ...EMPTY, reason: "no_token" };
  const campaignId = await getRawSetting<string | null>(
    "patreon_campaign_id",
    null,
  );
  if (!campaignId) return { ...EMPTY, reason: "no_campaign" };

  let members;
  try {
    members = await fetchCampaignMembers(campaignId, token);
  } catch (err) {
    console.error("[patreon] reconcile failed:", err);
    return { ...EMPTY, reason: "failed" };
  }

  const byPatreonId = new Map(members.map((m) => [m.patreonUserId, m]));

  // Only people already linked to an account can be reconciled — a pledge from
  // someone who never connected has no account to open.
  const links = await db.select().from(patreonLinks);
  const graceDays = await getSetting("grace_days");

  let matched = 0;
  let changed = 0;
  let restored = 0;

  for (const link of links) {
    const m = byPatreonId.get(link.patreonUserId);
    // Absent from the roster = no longer a member of the campaign at all.
    const status: PatronStatus = m?.patronStatus ?? null;
    const tierIds = m?.entitledTierIds ?? [];
    if (m) matched++;

    const before = link.patronStatus ?? null;
    const sameStatus = before === status;
    const sameTiers =
      JSON.stringify([...(link.currentlyEntitledTierIds ?? [])].sort()) ===
      JSON.stringify([...tierIds].sort());
    // Always stamp lastSyncedAt so "when did we last look" stays honest, but
    // only do the entitlement write when something actually moved.
    if (sameStatus && sameTiers) {
      await db
        .update(patreonLinks)
        .set({ lastSyncedAt: new Date() })
        .where(eq(patreonLinks.userId, link.userId));
      continue;
    }

    await db
      .update(patreonLinks)
      .set({
        currentlyEntitledTierIds: tierIds,
        patronStatus: status ?? undefined,
        campaignMember: Boolean(m),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(patreonLinks.userId, link.userId));

    const lifecycle = lifecycleFor(status);
    const graceUntil =
      lifecycle === "grace"
        ? new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)
        : null;
    await writePatreonEntitlement(link.userId, lifecycle, graceUntil);

    changed++;
    if (before !== "active_patron" && status === "active_patron") restored++;
  }

  await logAudit(null, "patreon.reconciled", {
    members: members.length,
    matched,
    changed,
    restored,
  });

  return {
    ok: true,
    members: members.length,
    matched,
    changed,
    restored,
  };
}

/**
 * Re-check ONE subject against the campaign roster. Same source of truth as the
 * sweep, but immediate — this is what the "I've resubscribed" button on a
 * frozen subject's own page calls, so nobody has to wait an hour to get back
 * what they just paid for.
 */
export async function reconcileOne(userId: string): Promise<boolean> {
  const token = env.PATREON_CREATOR_ACCESS_TOKEN;
  if (!token) return false;
  const campaignId = await getRawSetting<string | null>(
    "patreon_campaign_id",
    null,
  );
  if (!campaignId) return false;

  const [link] = await db
    .select()
    .from(patreonLinks)
    .where(eq(patreonLinks.userId, userId))
    .limit(1);
  if (!link) return false;

  let members;
  try {
    members = await fetchCampaignMembers(campaignId, token);
  } catch (err) {
    console.error("[patreon] reconcileOne failed:", err);
    return false;
  }

  const m = members.find((x) => x.patreonUserId === link.patreonUserId);
  const status: PatronStatus = m?.patronStatus ?? null;
  const lifecycle = lifecycleFor(status);
  const graceDays = await getSetting("grace_days");

  await db
    .update(patreonLinks)
    .set({
      currentlyEntitledTierIds: m?.entitledTierIds ?? [],
      patronStatus: status ?? undefined,
      campaignMember: Boolean(m),
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(patreonLinks.userId, userId));

  await writePatreonEntitlement(
    userId,
    lifecycle,
    lifecycle === "grace"
      ? new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000)
      : null,
  );
  await logAudit(userId, "patreon.rechecked", { status });
  return lifecycle === "active";
}
