import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { pollVotes, polls, whisperReceipts, whispers } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { audienceMatches } from "@/lib/push/audience";
import { tallyVotes, type PollOption, type Tally } from "@/lib/polls/tally";

/** A poll attached to a whisper, rendered + voted inline in the feed (R1). */
export interface WhisperPollView {
  id: string;
  question: string;
  options: PollOption[];
  status: "open" | "closed";
  /** The viewer's current choice; null when logged-out or not yet voted. */
  myVote: string | null;
  /** Whether she has chosen to reveal the tally. */
  resultsShared: boolean;
  /** Populated only once results are shared (otherwise counts stay hidden). */
  results: Tally[] | null;
  total: number;
}

export interface WhisperCard {
  id: string;
  body: string | null;
  imageKey: string | null;
  pinned: boolean;
  publishedAt: Date | null;
  knelt: boolean;
  poll: WhisperPollView | null;
}

/**
 * Build inline poll views for a set of whisper polls. Results (tallies) are
 * only ever returned for polls she has explicitly shared — matching the
 * existing subject-facing rule that votes stay private until she reveals them.
 */
async function pollViewsFor(
  pollIds: string[],
  userId: string | null,
): Promise<Map<string, WhisperPollView>> {
  const map = new Map<string, WhisperPollView>();
  if (pollIds.length === 0) return map;

  const pollRows = await db
    .select()
    .from(polls)
    .where(inArray(polls.id, pollIds));

  // The viewer's own vote per poll (signed-in only).
  const myVoteByPoll = new Map<string, string>();
  if (userId) {
    const mine = await db
      .select()
      .from(pollVotes)
      .where(
        and(eq(pollVotes.userId, userId), inArray(pollVotes.pollId, pollIds)),
      );
    for (const v of mine) myVoteByPoll.set(v.pollId, v.optionId);
  }

  // Tallies only for polls whose results she has shared.
  const sharedIds = pollRows.filter((p) => p.resultsShared).map((p) => p.id);
  const votesByPoll = new Map<string, { optionId: string }[]>();
  if (sharedIds.length > 0) {
    const allVotes = await db
      .select({ pollId: pollVotes.pollId, optionId: pollVotes.optionId })
      .from(pollVotes)
      .where(inArray(pollVotes.pollId, sharedIds));
    for (const v of allVotes) {
      const arr = votesByPoll.get(v.pollId) ?? [];
      arr.push({ optionId: v.optionId });
      votesByPoll.set(v.pollId, arr);
    }
  }

  for (const p of pollRows) {
    const options = p.options as PollOption[];
    let results: Tally[] | null = null;
    let total = 0;
    if (p.resultsShared) {
      const t = tallyVotes(options, votesByPoll.get(p.id) ?? []);
      results = t.results;
      total = t.total;
    }
    map.set(p.id, {
      id: p.id,
      question: p.question,
      options,
      status: p.status as "open" | "closed",
      myVote: myVoteByPoll.get(p.id) ?? null,
      resultsShared: p.resultsShared,
      results,
      total,
    });
  }
  return map;
}

/** Whispers targeted to this subject, pinned first then newest (A11 / R1). */
export async function whispersForSubject(
  userId: string,
  userLevel: number,
  limit = 50,
): Promise<WhisperCard[]> {
  const rows = await db
    .select()
    .from(whispers)
    .where(isNotNull(whispers.publishedAt))
    .orderBy(desc(whispers.pinned), desc(whispers.publishedAt))
    .limit(200);

  const matched = rows.filter((w) =>
    audienceMatches(w.audience as Audience, userLevel, userId),
  );
  if (matched.length === 0) return [];
  const visible = matched.slice(0, limit);

  const receipts = await db
    .select()
    .from(whisperReceipts)
    .where(eq(whisperReceipts.userId, userId));
  const kneltSet = new Set(
    receipts.filter((r) => r.kneltAt).map((r) => r.whisperId),
  );

  const pollIds = visible
    .map((w) => w.pollId)
    .filter((id): id is string => Boolean(id));
  const pollViews = await pollViewsFor(pollIds, userId);

  return visible.map((w) => ({
    id: w.id,
    body: w.body,
    imageKey: w.imageKey,
    pinned: w.pinned,
    publishedAt: w.publishedAt,
    knelt: kneltSet.has(w.id),
    poll: w.pollId ? pollViews.get(w.pollId) ?? null : null,
  }));
}

/**
 * Public whispers for logged-out visitors — audience `public` only, pinned
 * first then newest (R1 public front door). Never leaks other audiences.
 */
export async function publicWhispers(limit = 50): Promise<WhisperCard[]> {
  const rows = await db
    .select()
    .from(whispers)
    .where(isNotNull(whispers.publishedAt))
    .orderBy(desc(whispers.pinned), desc(whispers.publishedAt))
    .limit(200);

  const matched = rows.filter(
    (w) => (w.audience as Audience).type === "public",
  );
  if (matched.length === 0) return [];
  const visible = matched.slice(0, limit);

  const pollIds = visible
    .map((w) => w.pollId)
    .filter((id): id is string => Boolean(id));
  // No userId → no personal vote; results still gated by resultsShared.
  const pollViews = await pollViewsFor(pollIds, null);

  return visible.map((w) => ({
    id: w.id,
    body: w.body,
    imageKey: w.imageKey,
    pinned: w.pinned,
    publishedAt: w.publishedAt,
    knelt: false,
    poll: w.pollId ? pollViews.get(w.pollId) ?? null : null,
  }));
}

/** Mark a whisper seen + knelt for a subject (idempotent). */
export async function kneel(userId: string, whisperId: string): Promise<void> {
  await db
    .insert(whisperReceipts)
    .values({ whisperId, userId, seenAt: new Date(), kneltAt: new Date() })
    .onConflictDoUpdate({
      target: [whisperReceipts.whisperId, whisperReceipts.userId],
      set: { kneltAt: new Date(), seenAt: new Date() },
    });
}

/** Per-whisper seen/knelt counts for the Sanctum. */
export async function whisperStats(whisperId: string) {
  const receipts = await db
    .select()
    .from(whisperReceipts)
    .where(eq(whisperReceipts.whisperId, whisperId));
  return {
    seen: receipts.filter((r) => r.seenAt).length,
    knelt: receipts.filter((r) => r.kneltAt).length,
  };
}
