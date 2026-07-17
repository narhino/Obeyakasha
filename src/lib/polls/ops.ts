import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { pollVotes, polls } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { audienceMatches } from "@/lib/push/audience";
import { tallyVotes, type PollOption } from "./tally";

/**
 * Insert an open poll and return its id. Shared creation core so both the
 * Sanctum polls page and the whisper composer (R1 inline poll) create polls
 * the same way.
 */
export async function createPollRecord(input: {
  question: string;
  options: PollOption[];
  audience: Audience;
  anonymousToAdmin?: boolean;
}): Promise<string> {
  const [poll] = await db
    .insert(polls)
    .values({
      question: input.question,
      options: input.options,
      audience: input.audience,
      anonymousToAdmin: input.anonymousToAdmin ?? false,
      status: "open",
    })
    .returning({ id: polls.id });
  return poll!.id;
}

/** Open polls, newest first — for the whisper composer's "attach a poll" list. */
export async function listOpenPolls(): Promise<
  { id: string; question: string }[]
> {
  return db
    .select({ id: polls.id, question: polls.question })
    .from(polls)
    .where(eq(polls.status, "open"))
    .orderBy(desc(polls.createdAt))
    .limit(50);
}

/** Open polls this subject may vote in, with their current choice. */
export async function openPollsForSubject(
  userId: string,
  userLevel: number,
): Promise<
  { id: string; question: string; options: PollOption[]; myVote: string | null }[]
> {
  const rows = await db
    .select()
    .from(polls)
    .where(eq(polls.status, "open"))
    .orderBy(desc(polls.createdAt))
    .limit(100);
  const matched = rows.filter((p) =>
    audienceMatches(p.audience as Audience, userLevel, userId),
  );
  if (matched.length === 0) return [];

  const myVotes = await db
    .select()
    .from(pollVotes)
    .where(eq(pollVotes.userId, userId));
  const voteByPoll = new Map(myVotes.map((v) => [v.pollId, v.optionId]));

  return matched.map((p) => ({
    id: p.id,
    question: p.question,
    options: p.options as PollOption[],
    myVote: voteByPoll.get(p.id) ?? null,
  }));
}

/** Cast/replace a vote (changeable until close). */
export async function castVote(
  userId: string,
  pollId: string,
  optionId: string,
): Promise<void> {
  const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);
  if (!poll || poll.status !== "open") throw new Error("Poll not open");
  const valid = (poll.options as PollOption[]).some((o) => o.id === optionId);
  if (!valid) throw new Error("Invalid option");
  await db
    .insert(pollVotes)
    .values({ pollId, userId, optionId })
    .onConflictDoUpdate({
      target: [pollVotes.pollId, pollVotes.userId],
      set: { optionId, createdAt: new Date() },
    });
}

/** Tally a poll's current votes. */
export async function pollResults(pollId: string) {
  const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);
  if (!poll) return null;
  const votes = await db
    .select({ optionId: pollVotes.optionId })
    .from(pollVotes)
    .where(eq(pollVotes.pollId, pollId));
  return tallyVotes(poll.options as PollOption[], votes);
}

export async function closePoll(pollId: string): Promise<void> {
  await db.update(polls).set({ status: "closed" }).where(eq(polls.id, pollId));
}

/** Open polls whose closesAt has passed (for the close job). */
export async function expiredOpenPolls() {
  return db
    .select({ id: polls.id })
    .from(polls)
    .where(and(eq(polls.status, "open"), lt(polls.closesAt, new Date())));
}
