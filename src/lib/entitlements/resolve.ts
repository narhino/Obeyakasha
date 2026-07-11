import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  entitlements,
  patreonLinks,
  tierMappings,
} from "@/lib/db/schema";
import {
  effectiveAccess,
  type EntitlementResult,
  type EntitlementStatus,
  type GrantEntitlement,
  type PatreonState,
} from "./core";

/**
 * DB-backed entitlement resolution. Reads the user's Patreon link + entitlement
 * rows + tier mappings, then delegates the actual math to the pure
 * effectiveAccess() (unit-tested in core.test.ts).
 */
export async function resolveAccess(
  userId: string,
): Promise<EntitlementResult> {
  const [link, ents, maps] = await Promise.all([
    db
      .select()
      .from(patreonLinks)
      .where(eq(patreonLinks.userId, userId))
      .limit(1),
    db.select().from(entitlements).where(eq(entitlements.userId, userId)),
    db.select().from(tierMappings),
  ]);

  const patreonEnt = ents.find((e) => e.source === "patreon");
  const patreon: PatreonState | undefined =
    link.length > 0
      ? {
          entitledTierIds: link[0]!.currentlyEntitledTierIds ?? [],
          status: (patreonEnt?.status ?? "active") as EntitlementStatus,
        }
      : undefined;

  const grants: GrantEntitlement[] = ents
    .filter((e) => e.source === "grant")
    .map((e) => ({
      accessLevel: e.accessLevel,
      status: e.status as EntitlementStatus,
    }));

  return effectiveAccess({
    patreon,
    grants,
    mappings: maps.map((m) => ({
      patreonTierId: m.patreonTierId,
      accessLevel: m.accessLevel,
    })),
  });
}

/**
 * Upsert the single Patreon entitlement row for a user after a sync. Keeps the
 * derived accessLevel denormalized for quick reads; the source of truth for
 * WHICH tiers is patreon_links.currentlyEntitledTierIds.
 */
export async function writePatreonEntitlement(
  userId: string,
  status: EntitlementStatus,
  graceUntil: Date | null,
): Promise<void> {
  const result = await resolveAccess(userId);
  const existing = await db
    .select()
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.source, "patreon"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(entitlements)
      .set({
        accessLevel: result.accessLevel,
        status,
        graceUntil,
        updatedAt: new Date(),
      })
      .where(eq(entitlements.id, existing[0]!.id));
  } else {
    await db.insert(entitlements).values({
      userId,
      source: "patreon",
      accessLevel: result.accessLevel,
      status,
      graceUntil,
    });
  }
}

/** Grant a per-user access level (commission delivery, gift). */
export async function grantAccessLevel(
  userId: string,
  accessLevel: number,
  reason: string,
): Promise<void> {
  await db.insert(entitlements).values({
    userId,
    source: "grant",
    accessLevel,
    status: "active",
    reason,
  });
}

/** Fetch users whose Patreon link is in a given set of tier ids (for reconciliation). */
export async function usersWithTiers(tierIds: string[]) {
  if (tierIds.length === 0) return [];
  return db
    .select()
    .from(patreonLinks)
    .where(inArray(patreonLinks.patreonUserId, tierIds));
}
