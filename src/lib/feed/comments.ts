import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, users, whisperComments } from "@/lib/db/schema";
import { getOrCreateThread, sendGoddessMessage } from "@/lib/messages/ops";
import { notifyGoddess } from "@/lib/push/broadcast";
import { alertOnce, excerpt } from "@/lib/push/alerts";

/**
 * Private comments under whispers (F3). A comment is visible ONLY to its author
 * and to the goddess (D7, absolute). Everything a SUBJECT can reach here is
 * scoped to `userId = viewer`; only the *Admin readers expose the whole set, and
 * they are called exclusively from the Sanctum (goddess-gated) surfaces.
 */

/** Per-subject ceiling of comments on a single whisper (in-voice refusal above). */
export const MAX_COMMENTS_PER_WHISPER = 10;

/** How she has (or hasn't) met a comment yet. */
export type CommentState = "unheard" | "seen" | "replied";

/** A comment as its own author sees it — their words + how she answered. */
export interface WhisperCommentView {
  id: string;
  body: string;
  createdAt: Date;
  state: CommentState;
  /** Her reply text, mirrored from the Messages thread; null until she speaks. */
  reply: string | null;
}

/** A comment as the goddess sees it in the Sanctum — with the subject named. */
export interface WhisperCommentAdmin {
  id: string;
  whisperId: string;
  userId: string;
  name: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  reply: string | null;
}

function stateOf(readAt: Date | null, replyId: string | null): CommentState {
  if (replyId) return "replied";
  if (readAt) return "seen";
  return "unheard";
}

/**
 * A subject speaks under a whisper. Enforces the per-whisper cap and absorbs a
 * rapid identical double-submit (60s dedup, matching the wishes petition path).
 */
export async function createComment(
  userId: string,
  whisperId: string,
  rawBody: string,
): Promise<
  | { ok: true; comment: WhisperCommentView; deduped?: boolean }
  | { ok: false; reason: "empty" | "full" }
> {
  const body = rawBody.trim();
  if (body.length === 0) return { ok: false, reason: "empty" };
  const clipped = body.slice(0, 500);

  // Dedup: an identical comment inside a minute is a double-submit, not a
  // second thought — return the one already saved.
  const [dupe] = await db
    .select()
    .from(whisperComments)
    .where(
      and(
        eq(whisperComments.userId, userId),
        eq(whisperComments.whisperId, whisperId),
        eq(whisperComments.body, clipped),
        gt(whisperComments.createdAt, new Date(Date.now() - 60_000)),
      ),
    )
    .limit(1);
  if (dupe) {
    return {
      ok: true,
      deduped: true,
      comment: {
        id: dupe.id,
        body: dupe.body,
        createdAt: dupe.createdAt,
        state: stateOf(dupe.readAt, dupe.replyMessageId),
        reply: null,
      },
    };
  }

  // Cap: no more than MAX_COMMENTS_PER_WHISPER from one subject on one whisper.
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(whisperComments)
    .where(
      and(
        eq(whisperComments.userId, userId),
        eq(whisperComments.whisperId, whisperId),
      ),
    );
  if (n >= MAX_COMMENTS_PER_WHISPER) return { ok: false, reason: "full" };

  const [created] = await db
    .insert(whisperComments)
    .values({ whisperId, userId, body: clipped })
    .returning();

  // Someone spoke under a whisper — she'd want to know, deep-linked to that
  // whisper's thread. Deduped per subject+whisper so a burst is one alert.
  if (alertOnce(`comment:${userId}:${whisperId}`)) {
    await notifyGoddess(
      "Someone spoke under you.",
      excerpt(clipped),
      `/sanctum/whispers/${whisperId}`,
    ).catch(() => {});
  }

  return {
    ok: true,
    comment: {
      id: created!.id,
      body: created!.body,
      createdAt: created!.createdAt,
      state: "unheard",
      reply: null,
    },
  };
}

/**
 * The viewer's OWN comment threads for a batch of whispers (no N+1). Scoped to
 * `userId = viewer`, so another subject's comments can never enter this payload.
 * Newest-first within each whisper; carries her reply text where she has spoken.
 */
export async function commentsForViewer(
  userId: string,
  whisperIds: string[],
): Promise<Map<string, WhisperCommentView[]>> {
  const map = new Map<string, WhisperCommentView[]>();
  if (whisperIds.length === 0) return map;

  const rows = await db
    .select({
      id: whisperComments.id,
      whisperId: whisperComments.whisperId,
      body: whisperComments.body,
      createdAt: whisperComments.createdAt,
      readAt: whisperComments.readAt,
      replyMessageId: whisperComments.replyMessageId,
      replyBody: messages.body,
    })
    .from(whisperComments)
    .leftJoin(messages, eq(messages.id, whisperComments.replyMessageId))
    .where(
      and(
        eq(whisperComments.userId, userId),
        inArray(whisperComments.whisperId, whisperIds),
      ),
    )
    .orderBy(desc(whisperComments.createdAt));

  for (const r of rows) {
    const arr = map.get(r.whisperId) ?? [];
    arr.push({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      state: stateOf(r.readAt, r.replyMessageId),
      reply: r.replyMessageId ? r.replyBody ?? null : null,
    });
    map.set(r.whisperId, arr);
  }
  return map;
}

/** SANCTUM ONLY — every comment on a whisper, subject named, newest first. */
export async function whisperCommentsAdmin(
  whisperId: string,
): Promise<WhisperCommentAdmin[]> {
  const rows = await db
    .select({
      id: whisperComments.id,
      whisperId: whisperComments.whisperId,
      userId: whisperComments.userId,
      name: users.chosenName,
      email: users.email,
      body: whisperComments.body,
      createdAt: whisperComments.createdAt,
      readAt: whisperComments.readAt,
      replyMessageId: whisperComments.replyMessageId,
      replyBody: messages.body,
    })
    .from(whisperComments)
    .innerJoin(users, eq(users.id, whisperComments.userId))
    .leftJoin(messages, eq(messages.id, whisperComments.replyMessageId))
    .where(eq(whisperComments.whisperId, whisperId))
    .orderBy(desc(whisperComments.createdAt));

  return rows.map((r) => ({
    id: r.id,
    whisperId: r.whisperId,
    userId: r.userId,
    name: r.name ?? r.email ?? r.userId.slice(0, 8),
    body: r.body,
    createdAt: r.createdAt,
    readAt: r.readAt,
    reply: r.replyMessageId ? r.replyBody ?? null : null,
  }));
}

/** SANCTUM ONLY — unread-comment counts per whisper (one grouped query). */
export async function unreadCommentCountsFor(
  whisperIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (whisperIds.length === 0) return map;
  const rows = await db
    .select({
      whisperId: whisperComments.whisperId,
      n: sql<number>`count(*)::int`,
    })
    .from(whisperComments)
    .where(
      and(
        inArray(whisperComments.whisperId, whisperIds),
        isNull(whisperComments.readAt),
      ),
    )
    .groupBy(whisperComments.whisperId);
  for (const r of rows) map.set(r.whisperId, r.n);
  return map;
}

/** SANCTUM ONLY — total unread comments across all whispers (nav badge / Today). */
export async function totalUnreadComments(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(whisperComments)
    .where(isNull(whisperComments.readAt));
  return row?.n ?? 0;
}

/** SANCTUM ONLY — mark every unread comment on a whisper as seen (on view). */
export async function markCommentsRead(whisperId: string): Promise<void> {
  await db
    .update(whisperComments)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(whisperComments.whisperId, whisperId),
        isNull(whisperComments.readAt),
      ),
    );
}

/**
 * SANCTUM ONLY — she answers a comment. The reply lands as a REAL message in
 * that subject's existing thread (reusing the messages send path, incl. its
 * disguise-aware push), and the comment is stamped with the message id + read,
 * so the subject's whisper thread mirrors her reply. Returns the subject id so
 * the caller can audit against them.
 */
export async function replyToComment(
  commentId: string,
  body: string,
): Promise<{ ok: false } | { ok: true; userId: string; messageId: string }> {
  const [comment] = await db
    .select({ id: whisperComments.id, userId: whisperComments.userId })
    .from(whisperComments)
    .where(eq(whisperComments.id, commentId))
    .limit(1);
  if (!comment) return { ok: false };

  const threadId = await getOrCreateThread(comment.userId);
  const messageId = await sendGoddessMessage(threadId, body);
  await db
    .update(whisperComments)
    .set({ replyMessageId: messageId, readAt: new Date() })
    .where(eq(whisperComments.id, commentId));

  return { ok: true, userId: comment.userId, messageId };
}

/**
 * SANCTUM ONLY — delete a subject's comment (her prerogative). The reply message
 * she may already have sent stays in the subject's thread (it truly reached
 * them). Returns the subject id for auditing. Idempotent.
 */
export async function deleteComment(
  commentId: string,
): Promise<{ ok: false } | { ok: true; userId: string }> {
  const [gone] = await db
    .delete(whisperComments)
    .where(eq(whisperComments.id, commentId))
    .returning({ userId: whisperComments.userId });
  return gone ? { ok: true, userId: gone.userId } : { ok: false };
}
