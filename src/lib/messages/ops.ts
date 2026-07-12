import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, threads, users, voiceCorpus } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { triageMessage } from "./triage";

export async function getOrCreateThread(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(eq(threads.userId, userId))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(threads).values({ userId }).returning();
  return created!.id;
}

/** Subject sends a message (D7, F11). Rate-limited; safety-triaged. */
export async function sendSubjectMessage(
  userId: string,
  body: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const limit = await getSetting("msg_daily_limit");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const threadId = await getOrCreateThread(userId);

  const countRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.threadId, threadId),
        eq(messages.sender, "subject"),
        gte(messages.createdAt, since),
      ),
    );
  const n = countRows[0]?.n ?? 0;
  if (n >= limit) return { ok: false, reason: "limit" };

  const flag = triageMessage(body);
  await db.insert(messages).values({
    threadId,
    sender: "subject",
    body,
    flaggedSafety: flag !== "none",
  });
  return { ok: true };
}

/** Akasha replies (never auto-sent by AI). Marks the subject's messages read. */
export async function sendGoddessMessage(
  threadId: string,
  body: string,
): Promise<void> {
  await db.insert(messages).values({ threadId, sender: "goddess", body });
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.threadId, threadId),
        eq(messages.sender, "subject"),
        isNull(messages.readAt),
      ),
    );
  // Every reply she actually sends trains the voice corpus (F11).
  await db.insert(voiceCorpus).values({
    source: "sent_reply",
    text: body,
    approved: true,
  });
}

export async function threadMessages(threadId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.createdAt);
}

export async function myThread(userId: string) {
  const threadId = await getOrCreateThread(userId);
  return { threadId, messages: await threadMessages(threadId) };
}

/** Sanctum inbox: threads with last message + unread + safety flag. */
export async function inboxThreads() {
  const rows = await db
    .select({
      threadId: threads.id,
      userId: threads.userId,
      name: users.chosenName,
      email: users.email,
    })
    .from(threads)
    .innerJoin(users, eq(users.id, threads.userId));

  const out = [];
  for (const t of rows) {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.threadId, t.threadId))
      .orderBy(desc(messages.createdAt))
      .limit(30);
    if (msgs.length === 0) continue;
    const unread = msgs.filter(
      (m) => m.sender === "subject" && !m.readAt,
    ).length;
    const flagged = msgs.some((m) => m.flaggedSafety && !m.readAt);
    out.push({
      threadId: t.threadId,
      userId: t.userId,
      name: t.name ?? t.email ?? t.userId.slice(0, 8),
      last: msgs[0]!,
      unread,
      flagged,
    });
  }
  // Flagged first, then unread, then recency.
  out.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    if (a.unread !== b.unread) return b.unread - a.unread;
    return (b.last.createdAt?.getTime() ?? 0) - (a.last.createdAt?.getTime() ?? 0);
  });
  return out;
}
