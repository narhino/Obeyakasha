import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, threads, users, voiceCorpus } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { broadcast, notifyGoddess } from "@/lib/push/broadcast";
import { alertOnce, excerpt } from "@/lib/push/alerts";
import { copy } from "@/copy/copy";
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

  // Tell her — a message is the one thing a subject sends that expects her
  // answer. Deep-links to that thread. Deduped so a talkative subject can't
  // buzz her once per line; a flagged message always gets through.
  if (flag !== "none" || alertOnce(`msg:${userId}`)) {
    await notifyGoddess(
      flag !== "none" ? "A message that needs care." : "A message for you.",
      excerpt(body),
      `/sanctum/messages/${threadId}`,
    ).catch(() => {});
  }
  return { ok: true };
}

/** Akasha replies (never auto-sent by AI). Marks the subject's messages read.
 *  Returns the new message's id (F3 links a whisper-comment reply to it). */
export async function sendGoddessMessage(
  threadId: string,
  body: string,
  contextNote?: string,
): Promise<string> {
  const [msg] = await db
    .insert(messages)
    .values({ threadId, sender: "goddess", body, contextNote })
    .returning({ id: messages.id });
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
  // R7: tell that one subject she spoke. The reply is already saved above, so a
  // push failure is best-effort — it must never lose her words.
  try {
    const [thread] = await db
      .select({ userId: threads.userId })
      .from(threads)
      .where(eq(threads.id, threadId))
      .limit(1);
    if (thread) {
      const stats = await broadcast({
        title: copy.messages.spokePush.title,
        body: copy.messages.spokePush.body,
        deepLink: "/messages",
        audience: { type: "users", userIds: [thread.userId] },
        kind: "manual",
      });
      // Bind the push to the message so the thread can show what became of it —
      // accepted, actually drawn on their device, opened.
      await db
        .update(messages)
        .set({ pushNotificationId: stats.notificationId })
        .where(eq(messages.id, msg!.id));
    }
  } catch (err) {
    console.error("[messages] goddess reply push failed:", err);
  }
  return msg!.id;
}

/**
 * She opened the thread: their words are now read, but NOT yet answered.
 *
 * Nothing used to mark these read except actually replying, so a thread stayed
 * red until she wrote back and the "read it, owe them an answer" state could
 * never exist. Called after the messages are loaded for render, so the page
 * still shows what was unread the moment she arrived — and, importantly, so the
 * safety banner is decided before this clears it.
 */
export async function markThreadRead(threadId: string): Promise<void> {
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
  const msgs = await threadMessages(threadId);
  // Opening the thread marks her words seen — this clears the Messages tab's red
  // burn (F5). `readAt` on a goddess-sent row means "the subject has read it"
  // (the mirror of the subject-side readAt she sets when she replies).
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.threadId, threadId),
        eq(messages.sender, "goddess"),
        isNull(messages.readAt),
      ),
    );
  return { threadId, messages: msgs };
}

/** Sanctum inbox: threads with last message + unread + safety flag. */
/**
 * Where a thread stands with her — the whole point of the inbox at a glance.
 *
 *   "unread"    they wrote and she has not opened it            → red
 *   "unreplied" she has read it, but they still spoke last      → yellow
 *   "answered"  she spoke last; nothing is owed                 → quiet
 *
 * The middle state is the one that was missing. Opening a thread cleared the
 * red and the thread then looked identical to one she had actually answered,
 * so anything she read-and-meant-to-come-back-to simply vanished from view.
 */
export type ThreadState = "unread" | "unreplied" | "answered";

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
    const last = msgs[0]!;
    const state: ThreadState =
      unread > 0 ? "unread" : last.sender === "subject" ? "unreplied" : "answered";
    out.push({
      threadId: t.threadId,
      userId: t.userId,
      name: t.name ?? t.email ?? t.userId.slice(0, 8),
      last,
      unread,
      flagged,
      state,
    });
  }
  // Newest activity on top, the way every inbox she has ever used behaves —
  // safety-flagged threads excepted, which always surface first because those
  // are the ones that must not wait behind a busy day. State is carried by
  // colour rather than by position, so nothing she has read sinks out of sight.
  out.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    return (b.last.createdAt?.getTime() ?? 0) - (a.last.createdAt?.getTime() ?? 0);
  });
  return out;
}
