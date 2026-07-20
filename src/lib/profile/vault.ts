import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { trackTriggers, tracks, triggers, userTriggers } from "@/lib/db/schema";
import { canAccess } from "@/lib/entitlements/core";
import { grantedTrackIds, notSomeoneElses } from "@/lib/library/queries";

export interface VaultTrigger {
  name: string;
  description: string | null;
  acquiredAt: Date;
}

export interface VaultData {
  /** The marks she's set in THIS subject — their own rows only. */
  carried: VaultTrigger[];
  /** Anonymous count of accessible-but-unearned marks (D7: never who, never
   *  where — a bare number of sealed slots). */
  waiting: number;
}

/**
 * The Trigger Vault (R9.2). Everything she has installed in this subject, plus a
 * count of the sealed slots — triggers she plants on tracks the subject can
 * already reach but hasn't yet earned. D7-safe: only the subject's own acquired
 * rows leave here; the unearned are an aggregate count, never a name and never
 * another subject's presence.
 */
export async function vaultFor(
  userId: string,
  accessLevel: number,
): Promise<VaultData> {
  const [carriedRows, granted] = await Promise.all([
    db
      .select({
        triggerId: userTriggers.triggerId,
        name: triggers.name,
        description: triggers.description,
        acquiredAt: userTriggers.acquiredAt,
      })
      .from(userTriggers)
      .innerJoin(triggers, eq(triggers.id, userTriggers.triggerId))
      .where(eq(userTriggers.userId, userId))
      .orderBy(desc(userTriggers.acquiredAt)),
    grantedTrackIds(userId),
  ]);

  const carriedIds = new Set(carriedRows.map((r) => r.triggerId));

  // Marks she plants ('installs' / 'reinforces') on tracks the subject can
  // reach — published + within level, or privately granted. 'requires' is a
  // prereq gate, not something she installs, so it never becomes a sealed slot.
  const plantRows = await db
    .select({
      triggerId: trackTriggers.triggerId,
      trackId: tracks.id,
      minAccessLevel: tracks.minAccessLevel,
      visibility: tracks.visibility,
    })
    .from(trackTriggers)
    .innerJoin(tracks, eq(tracks.id, trackTriggers.trackId))
    .where(
      and(
        inArray(trackTriggers.relation, ["installs", "reinforces"]),
        granted.size > 0
          ? or(
              eq(tracks.visibility, "published"),
              inArray(tracks.id, [...granted]),
            )
          : eq(tracks.visibility, "published"),
        // D7: a sealed-slot count never draws on another subject's upload.
        notSomeoneElses(userId),
      ),
    );

  const waitingIds = new Set<string>();
  for (const r of plantRows) {
    if (carriedIds.has(r.triggerId)) continue;
    const reachable =
      granted.has(r.trackId) ||
      (r.visibility === "published" && canAccess(accessLevel, r.minAccessLevel));
    if (reachable) waitingIds.add(r.triggerId);
  }

  return {
    carried: carriedRows.map((r) => ({
      name: r.name,
      description: r.description,
      acquiredAt: r.acquiredAt,
    })),
    waiting: waitingIds.size,
  };
}
