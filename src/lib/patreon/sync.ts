import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { patreonLinks, users } from "@/lib/db/schema";
import { getSetting, getRawSetting, setRawSetting } from "@/lib/settings";
import { writePatreonEntitlement } from "@/lib/entitlements/resolve";
import { logAudit } from "@/lib/audit";
import {
  fetchCampaignTiers,
  fetchIdentity,
  type CampaignMembership,
  type PatronStatus,
} from "./client";

type LifecycleStatus = "active" | "grace" | "frozen";

/** Map Patreon patron_status → our entitlement lifecycle. */
function lifecycleFor(status: PatronStatus): LifecycleStatus {
  switch (status) {
    case "active_patron":
      return "active";
    case "declined_patron":
      return "grace";
    default:
      return "frozen"; // former_patron / null
  }
}

/** Pick the membership that belongs to Akasha's campaign (or the first one). */
function membershipForCampaign(
  memberships: CampaignMembership[],
  campaignId: string | null,
): CampaignMembership | undefined {
  if (campaignId) {
    const match = memberships.find((m) => m.campaignId === campaignId);
    if (match) return match;
  }
  return memberships[0];
}

/**
 * Sync one user's Patreon linkage + entitlements from a fresh access token.
 * Idempotent; safe to call on every sign-in and from the webhook/reconcile jobs.
 */
export async function syncPatreonUser(params: {
  userId: string;
  accessToken: string;
  isGoddess: boolean;
}): Promise<void> {
  const { userId, accessToken, isGoddess } = params;

  // If the creator is signing in, discover the campaign + its tiers so the
  // Sanctum mapping UI has real data to work with.
  if (isGoddess) {
    try {
      const { campaignId, tiers } = await fetchCampaignTiers(accessToken);
      if (campaignId) await setRawSetting("patreon_campaign_id", campaignId);
      await setRawSetting("patreon_campaign_tiers", tiers);
    } catch {
      // Non-fatal: creator may not have campaign scope on this token yet.
    }
  }

  const identity = await fetchIdentity(accessToken);
  const campaignId = await getRawSetting<string | null>(
    "patreon_campaign_id",
    null,
  );
  const membership = membershipForCampaign(identity.memberships, campaignId);

  const entitledTierIds = membership?.entitledTierIds ?? [];
  const patronStatus = membership?.patronStatus ?? null;
  const lifecycle = lifecycleFor(patronStatus);

  // Upsert patreon link.
  const existing = await db
    .select()
    .from(patreonLinks)
    .where(eq(patreonLinks.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(patreonLinks)
      .set({
        currentlyEntitledTierIds: entitledTierIds,
        patronStatus: patronStatus ?? undefined,
        campaignMember: Boolean(membership),
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(patreonLinks.userId, userId));
  } else {
    await db.insert(patreonLinks).values({
      userId,
      patreonUserId: identity.patreonUserId,
      currentlyEntitledTierIds: entitledTierIds,
      patronStatus: patronStatus ?? undefined,
      campaignMember: Boolean(membership),
      lastSyncedAt: new Date(),
    });
  }

  // Grace window: declined patrons keep access until grace_days elapse.
  let graceUntil: Date | null = null;
  if (lifecycle === "grace") {
    const graceDays = await getSetting("grace_days");
    graceUntil = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
  }

  await writePatreonEntitlement(userId, lifecycle, graceUntil);
  await logAudit(null, "patreon.sync", {
    userId,
    lifecycle,
    tierCount: entitledTierIds.length,
  });
}

/** Ensure the DB user row carries the goddess role when their Patreon id matches. */
export async function pinGoddessRole(
  userId: string,
  patreonUserId: string,
  adminPatreonUserId: string | undefined,
): Promise<boolean> {
  if (!adminPatreonUserId || patreonUserId !== adminPatreonUserId) return false;
  await db
    .update(users)
    .set({ role: "goddess", updatedAt: new Date() })
    .where(eq(users.id, userId));
  await logAudit(userId, "role.pinned_goddess", { patreonUserId });
  return true;
}
