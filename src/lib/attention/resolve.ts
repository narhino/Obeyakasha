import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  messages,
  threads,
  users,
  whisperComments,
  whispers,
} from "@/lib/db/schema";
import { pendingTaskCount } from "@/lib/orders/ops";
import type { Attention } from "./types";

/**
 * The red attention system (F5). One cheap, fail-soft object the shell computes
 * once and hands to both navs: which tabs hold something that needs the subject
 * right now. A tab that burns clears when the subject visits it (each source
 * reuses an existing "seen" marker where one exists; Whispers uses the new
 * `users.lastSeenWhispersAt`).
 *
 * Nothing here is critical — every source is guarded, so a query failure just
 * leaves that tab unlit rather than breaking the chrome. The `Attention` shape
 * and `NO_ATTENTION` live in ./types so the client navs can import them without
 * pulling this DB-backed module (and postgres/web-push) into the browser.
 */
export async function attentionFor(userId: string): Promise<Attention> {
  const [tasks, whispersBurn, messagesBurn] = await Promise.all([
    pendingTaskCount(userId).catch(() => 0),
    hasUnseenWhispers(userId).catch(() => false),
    hasUnreadFromHer(userId).catch(() => false),
  ]);
  return { whispers: whispersBurn, tasks, messages: messagesBurn };
}

/**
 * The Whispers burn: a whisper published since they last opened the feed, or her
 * reply landing on one of their comments since then. Audience isn't re-checked
 * here (that query is heavier) — a rare over-signal clears the instant they open
 * `/`, which is the point of the glow: look.
 */
async function hasUnseenWhispers(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ seen: users.lastSeenWhispersAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const seen = u?.seen ?? null;

  const freshWhisper = await db
    .select({ id: whispers.id })
    .from(whispers)
    .where(
      seen
        ? and(isNotNull(whispers.publishedAt), gt(whispers.publishedAt, seen))
        : isNotNull(whispers.publishedAt),
    )
    .limit(1);
  if (freshWhisper.length > 0) return true;

  // Her reply to their comment lives as a real message; light Whispers too when
  // it arrived since they last looked (it also burns Messages, where it lives).
  const reply = await db
    .select({ id: whisperComments.id })
    .from(whisperComments)
    .innerJoin(messages, eq(messages.id, whisperComments.replyMessageId))
    .where(
      seen
        ? and(eq(whisperComments.userId, userId), gt(messages.createdAt, seen))
        : and(
            eq(whisperComments.userId, userId),
            isNotNull(whisperComments.replyMessageId),
          ),
    )
    .limit(1);
  return reply.length > 0;
}

/**
 * The Messages burn: any word from her still unread in the subject's thread.
 * `messages.readAt` on a goddess-sent row means "the subject has seen it" — set
 * when they open their thread (see `myThread`). No new column needed.
 */
async function hasUnreadFromHer(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(threads, eq(threads.id, messages.threadId))
    .where(
      and(
        eq(threads.userId, userId),
        eq(messages.sender, "goddess"),
        isNull(messages.readAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
