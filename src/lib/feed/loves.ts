import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { whisperLoves } from "@/lib/db/schema";

/**
 * Loves on whispers (F3). A love is a toggle, one per (whisper, subject). The
 * only thing anyone but the goddess may ever learn is the AGGREGATE count —
 * never who loved (D7). These helpers return counts and the VIEWER'S OWN state,
 * nothing else; there is deliberately no "who loved this" reader anywhere.
 */

/** Toggle the viewer's love on a whisper. Returns the new state + fresh count. */
export async function toggleLove(
  userId: string,
  whisperId: string,
): Promise<{ loved: boolean; count: number }> {
  const [existing] = await db
    .select({ userId: whisperLoves.userId })
    .from(whisperLoves)
    .where(
      and(
        eq(whisperLoves.whisperId, whisperId),
        eq(whisperLoves.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(whisperLoves)
      .where(
        and(
          eq(whisperLoves.whisperId, whisperId),
          eq(whisperLoves.userId, userId),
        ),
      );
  } else {
    // onConflictDoNothing keeps a racing double-tap idempotent (PK guards one).
    await db
      .insert(whisperLoves)
      .values({ whisperId, userId })
      .onConflictDoNothing();
  }

  const count = await loveCount(whisperId);
  return { loved: !existing, count };
}

/** Aggregate love count for a single whisper. */
export async function loveCount(whisperId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(whisperLoves)
    .where(eq(whisperLoves.whisperId, whisperId));
  return row?.n ?? 0;
}

/** Aggregate love counts for a batch of whispers (one grouped query, no N+1). */
export async function loveCountsFor(
  whisperIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (whisperIds.length === 0) return map;
  const rows = await db
    .select({
      whisperId: whisperLoves.whisperId,
      n: sql<number>`count(*)::int`,
    })
    .from(whisperLoves)
    .where(inArray(whisperLoves.whisperId, whisperIds))
    .groupBy(whisperLoves.whisperId);
  for (const r of rows) map.set(r.whisperId, r.n);
  return map;
}

/** The set of whispers (from the given batch) the VIEWER themselves has loved. */
export async function lovedSetFor(
  userId: string,
  whisperIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>();
  if (whisperIds.length === 0) return set;
  const rows = await db
    .select({ whisperId: whisperLoves.whisperId })
    .from(whisperLoves)
    .where(
      and(
        eq(whisperLoves.userId, userId),
        inArray(whisperLoves.whisperId, whisperIds),
      ),
    );
  for (const r of rows) set.add(r.whisperId);
  return set;
}
