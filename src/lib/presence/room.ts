import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlements, users } from "@/lib/db/schema";
import { PRESENCE_WINDOW_MS } from "./core";

/**
 * "In the room" (F4) — the subjects whose heartbeat has landed inside the
 * presence window, freshest first. GODDESS-ONLY: it joins the collar names she
 * gave them and their level, and is never exposed to a subject (D7). Mirrors the
 * live-room helper's shape and role gating.
 */
export interface RoomSubject {
  userId: string;
  /** The name she gave them (collar name); a soft fallback if intake somehow lapsed. */
  name: string;
  /** Effective access level for the badge (max active/grace entitlement; 0 = Threshold). */
  level: number;
  /** ISO — for her quiet "seen just now / Xm ago" read-out only. */
  lastSeenAt: string;
}

export async function subjectsInRoom(
  now: Date = new Date(),
): Promise<RoomSubject[]> {
  const cutoff = new Date(now.getTime() - PRESENCE_WINDOW_MS);
  const rows = await db
    .select({
      userId: users.id,
      name: users.chosenName,
      lastSeenAt: users.lastSeenAt,
      level: sql<number>`coalesce(max(${entitlements.accessLevel}) filter (where ${entitlements.status} in ('active','grace')), 0)`,
    })
    .from(users)
    .leftJoin(entitlements, eq(entitlements.userId, users.id))
    .where(
      and(
        eq(users.role, "subject"),
        inArray(users.status, ["active", "frozen"]),
        gte(users.lastSeenAt, cutoff),
      ),
    )
    .groupBy(users.id)
    .orderBy(desc(users.lastSeenAt))
    .limit(100);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name ?? "one of mine",
    level: Number(r.level ?? 0),
    // Non-null by the WHERE (gte lastSeenAt), but narrow defensively.
    lastSeenAt: (r.lastSeenAt ?? now).toISOString(),
  }));
}
