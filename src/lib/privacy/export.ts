import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chains,
  consents,
  dropReports,
  listenSessions,
  messages,
  orderAssignments,
  pollVotes,
  questionAnswers,
  threads,
  userTriggers,
  users,
  wishes,
} from "@/lib/db/schema";

/** Assemble everything the platform holds about a subject (A21 / GDPR export). */
export async function exportUserData(userId: string) {
  const [
    [user],
    consentRows,
    answers,
    listens,
    drops,
    wishRows,
    votes,
    orders,
    triggers,
    [chain],
    [userThread],
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    db.select().from(consents).where(eq(consents.userId, userId)),
    db.select().from(questionAnswers).where(eq(questionAnswers.userId, userId)),
    db.select().from(listenSessions).where(eq(listenSessions.userId, userId)),
    db.select().from(dropReports).where(eq(dropReports.userId, userId)),
    db.select().from(wishes).where(eq(wishes.userId, userId)),
    db.select().from(pollVotes).where(eq(pollVotes.userId, userId)),
    db.select().from(orderAssignments).where(eq(orderAssignments.userId, userId)),
    db.select().from(userTriggers).where(eq(userTriggers.userId, userId)),
    db.select().from(chains).where(eq(chains.userId, userId)),
    db.select().from(threads).where(eq(threads.userId, userId)),
  ]);

  const threadId = userThread?.id;
  const msgs = threadId
    ? await db.select().from(messages).where(eq(messages.threadId, threadId))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    profile: user
      ? {
          chosenName: user.chosenName,
          honorific: user.honorific,
          pronouns: user.pronouns,
          timezone: user.timezone,
          email: user.email,
          claimedAt: user.createdAt,
        }
      : null,
    consents: consentRows,
    intakeAndAnswers: answers,
    listens,
    dropReports: drops,
    wishes: wishRows,
    pollVotes: votes,
    orders,
    triggersHeld: triggers,
    chain,
    messages: msgs,
  };
}
