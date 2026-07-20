import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { pollVotes, polls, whisperReceipts, whispers } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { audienceMatches } from "@/lib/push/audience";
import { signArtwork } from "@/lib/art/resolve";
import { tallyVotes, type PollOption, type Tally } from "@/lib/polls/tally";
import { loveCountsFor, lovedSetFor } from "./loves";
import { commentsForViewer, type WhisperCommentView } from "./comments";

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
  /** Signed, short-lived URL for her attached image (never a raw key); null if
   *  none. Renders as the card's editorial art (D5). */
  imageUrl: string | null;
  pinned: boolean;
  publishedAt: Date | null;
  knelt: boolean;
  poll: WhisperPollView | null;
  /** Aggregate loves (F3) — the ONLY love signal anyone but the goddess sees;
   *  never who, never a name (D7). Shown to logged-out visitors too. */
  loveCount: number;
  /** Whether the VIEWER has loved this; always false for logged-out visitors. */
  loved: boolean;
  /** The VIEWER'S OWN private comment thread (F3) — their words + her reply.
   *  Empty for logged-out visitors; never carries another subject's comment. */
  comments: WhisperCommentView[];
}

/** Sign the attached images for a batch of whispers (cheap HMAC, no N+1). */
async function imageUrlsFor(
  rows: { id: string; imageKey: string | null }[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    rows.map(async (w) => {
      if (!w.imageKey) return;
      const url = await signArtwork(w.imageKey);
      if (url) map.set(w.id, url);
    }),
  );
  return map;
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

/** Whispers targeted to this subject, pinned first then newest (A11 / R1).
 *  `isCollared` unlocks the `oath` audience for the collared inner circle (R9.5). */
export async function whispersForSubject(
  userId: string,
  userLevel: number,
  isCollared = false,
  limit = 50,
): Promise<WhisperCard[]> {
  const rows = await db
    .select()
    .from(whispers)
    .where(isNotNull(whispers.publishedAt))
    .orderBy(desc(whispers.pinned), desc(whispers.publishedAt))
    .limit(200);

  const matched = rows.filter((w) =>
    audienceMatches(w.audience as Audience, userLevel, userId, isCollared),
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
  const whisperIds = visible.map((w) => w.id);
  // All batched — no per-card queries (loves counts, viewer's love set, and the
  // viewer's OWN comment threads are each one round trip).
  const [pollViews, imageUrls, loveCounts, lovedSet, comments] =
    await Promise.all([
      pollViewsFor(pollIds, userId),
      imageUrlsFor(visible),
      loveCountsFor(whisperIds),
      lovedSetFor(userId, whisperIds),
      commentsForViewer(userId, whisperIds),
    ]);

  return visible.map((w) => ({
    id: w.id,
    body: w.body,
    imageKey: w.imageKey,
    imageUrl: imageUrls.get(w.id) ?? null,
    pinned: w.pinned,
    publishedAt: w.publishedAt,
    knelt: kneltSet.has(w.id),
    poll: w.pollId ? pollViews.get(w.pollId) ?? null : null,
    loveCount: loveCounts.get(w.id) ?? 0,
    loved: lovedSet.has(w.id),
    comments: comments.get(w.id) ?? [],
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
  const whisperIds = visible.map((w) => w.id);
  // No userId → no personal vote; results still gated by resultsShared. The
  // logged-out visitor sees ONLY the aggregate love count — never the loved
  // state, and NEVER any comment (D7): `comments` stays empty here by design.
  const [pollViews, imageUrls, loveCounts] = await Promise.all([
    pollViewsFor(pollIds, null),
    imageUrlsFor(visible),
    loveCountsFor(whisperIds),
  ]);

  return visible.map((w) => ({
    id: w.id,
    body: w.body,
    imageKey: w.imageKey,
    imageUrl: imageUrls.get(w.id) ?? null,
    pinned: w.pinned,
    publishedAt: w.publishedAt,
    knelt: false,
    poll: w.pollId ? pollViews.get(w.pollId) ?? null : null,
    loveCount: loveCounts.get(w.id) ?? 0,
    loved: false,
    comments: [],
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
