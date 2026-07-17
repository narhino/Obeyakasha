import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chains, listenSessions, moments } from "@/lib/db/schema";
import { broadcast } from "@/lib/push/broadcast";
import { copy, fill } from "@/copy/copy";
import { DESCENT, rankFor } from "./logic";

/**
 * Detect and record a rank-up for a subject (R7). Ranks are never stored — the
 * You page derives them on the fly from files-completed + chain length via the
 * pure `rankFor` over the `DESCENT` ladder. So the ledger of "the last rank we
 * told them about" is the `moments` table itself: the newest `rank_up` moment's
 * payload holds the last rank we recorded. When the freshly-computed rank sits
 * higher on the Descent than that, we write a new `rank_up` moment (which pops
 * up next session) and push her voice to that one subject.
 *
 * The first time we ever observe a subject we lay down a *silent* baseline
 * moment (shownAt set, no push) at their current rank, so subjects who were
 * already deep before R7 shipped don't get a false "you have risen" on the
 * first hook — only genuine crossings after that celebrate.
 *
 * NEVER throws. Rank is a side effect of progression; a failure here must never
 * break a listen, a mantra, or an order response. Call it after the inputs move
 * (chain kept, file completed); it is cheap and idempotent per rank.
 */
export async function recordRankProgress(userId: string): Promise<void> {
  try {
    const [filesRow, chainRow] = await Promise.all([
      db
        .select({ n: count() })
        .from(listenSessions)
        .where(
          and(
            eq(listenSessions.userId, userId),
            eq(listenSessions.completed, true),
          ),
        ),
      db
        .select({ currentLen: chains.currentLen })
        .from(chains)
        .where(eq(chains.userId, userId))
        .limit(1),
    ]);
    const filesCompleted = filesRow[0]?.n ?? 0;
    const chainLen = chainRow[0]?.currentLen ?? 0;
    const current = rankFor(filesCompleted, chainLen);
    const currentIdx = DESCENT.findIndex((r) => r.name === current.name);

    const [last] = await db
      .select({ payload: moments.payload })
      .from(moments)
      .where(and(eq(moments.userId, userId), eq(moments.kind, "rank_up")))
      .orderBy(desc(moments.createdAt))
      .limit(1);

    // First observation → silent baseline at the current rank. No push, no
    // pop-up; it only exists to anchor future comparisons.
    if (!last) {
      await db.insert(moments).values({
        userId,
        kind: "rank_up",
        payload: { rank: current.name },
        shownAt: new Date(),
      });
      return;
    }

    const prevName = (last.payload as { rank?: string }).rank;
    // Unknown prior rank clamps to the base of the ladder, so a rise is never
    // manufactured from bad data.
    const prevIdx = Math.max(0, DESCENT.findIndex((r) => r.name === prevName));
    if (currentIdx <= prevIdx) return; // no rise

    // A real rise: queue the ritual pop-up (shownAt null) …
    await db.insert(moments).values({
      userId,
      kind: "rank_up",
      payload: { rank: current.name },
    });
    // … and whisper it to their lock screen now (rare, so quiet hours yield).
    await broadcast({
      title: copy.ranks.upPush.title,
      body: fill(copy.ranks.upPush.body, { rank: current.name }),
      deepLink: "/me",
      audience: { type: "users", userIds: [userId] },
      kind: "automation",
      respectQuietHours: false,
    });
  } catch (err) {
    console.error("[ranks] recordRankProgress failed:", err);
  }
}
