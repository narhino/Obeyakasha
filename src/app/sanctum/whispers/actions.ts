"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { polls, whispers } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { sendWhisperPush } from "@/lib/feed/publish";
import { deleteComment, replyToComment } from "@/lib/feed/comments";
import { createPollRecord } from "@/lib/polls/ops";
import type { PollOption } from "@/lib/polls/tally";

const schema = z.object({
  body: z.string().max(500).optional(),
  audienceType: z.enum(["public", "all", "level", "oath", "user"]),
  level: z.coerce.number().int().min(0).max(99).optional(),
  userId: z.string().uuid().optional(),
  pollMode: z.enum(["none", "existing", "new"]).default("none"),
  existingPollId: z.string().uuid().optional(),
  pollQuestion: z.string().max(200).optional(),
  pollOptions: z.string().optional(), // newline-separated, 2–6
  // R9.9a: optional "Later" — a local datetime-local string. When set, the
  // whisper saves unpublished and the worker fires it (and the push) when due.
  scheduledFor: z.string().optional(),
  // Attachments: an image already uploaded to /api/sanctum/whisper-image (the
  // composer submits the opaque key it got back) and/or a track from the
  // catalog, played inline from the card by anyone entitled to hear it.
  imageKey: z.string().max(300).optional(),
  // The picture's own proportions, measured by the composer, plus how she chose
  // to sit it on the card. `natural` = posted exactly as it is.
  imageW: z.coerce.number().int().min(1).max(30000).optional(),
  imageH: z.coerce.number().int().min(1).max(30000).optional(),
  imageFit: z.enum(["natural", "wide", "square"]).default("natural"),
  audioTrackId: z.string().uuid().optional(),
  // Off by default: every whisper pushes. Checked posts it into the feed with
  // no buzz — for the small ones she doesn't want to wake anyone for.
  silent: z.enum(["true"]).optional(),
});

/** Result surfaced to the composer via useActionState — never throws for a
 *  validation slip (F03), so a mis-filled poll can't 500 the Sanctum. */
export type WhisperFormState = { ok?: boolean; error?: string; scheduled?: boolean };

/** Post a whisper (A11 / R1) → feed + push. May carry a poll. */
export async function publishWhisper(
  _prev: WhisperFormState,
  formData: FormData,
): Promise<WhisperFormState> {
  const session = await requireGoddess();
  const parsed = schema.safeParse({
    body: formData.get("body") || undefined,
    audienceType: formData.get("audienceType"),
    level: formData.get("level") || undefined,
    userId: formData.get("userId") || undefined,
    pollMode: formData.get("pollMode") || "none",
    existingPollId: formData.get("existingPollId") || undefined,
    pollQuestion: formData.get("pollQuestion") || undefined,
    pollOptions: formData.get("pollOptions") || undefined,
    scheduledFor: formData.get("scheduledFor") || undefined,
    imageKey: formData.get("imageKey") || undefined,
    imageW: formData.get("imageW") || undefined,
    imageH: formData.get("imageH") || undefined,
    imageFit: formData.get("imageFit") || "natural",
    audioTrackId: formData.get("audioTrackId") || undefined,
    silent: formData.get("silent") || undefined,
  });
  if (!parsed.success) return { error: "That whisper didn't hold together. Check the fields." };
  const d = parsed.data;

  // Resolve an optional schedule. A datetime-local string carries no zone, so
  // new Date() reads it in the server's local time — good enough for her dial.
  let scheduledFor: Date | null = null;
  if (d.scheduledFor) {
    const when = new Date(d.scheduledFor);
    if (Number.isNaN(when.getTime()))
      return { error: "That time didn't read. Pick it again." };
    if (when.getTime() <= Date.now())
      return { error: "Pick a time that's still ahead." };
    scheduledFor = when;
  }

  let audience: Audience;
  if (d.audienceType === "public") audience = { type: "public" };
  else if (d.audienceType === "all") audience = { type: "all" };
  else if (d.audienceType === "level")
    audience = { type: "level", level: d.level ?? 1 };
  else if (d.audienceType === "oath") audience = { type: "oath" };
  else {
    if (!d.userId) return { error: "Choose the one subject this is for." };
    audience = { type: "users", userIds: [d.userId] };
  }

  // Resolve an attached poll: an existing open one, or a fresh inline poll.
  let pollId: string | null = null;
  if (d.pollMode === "existing") {
    if (!d.existingPollId) return { error: "Choose which open poll to attach." };
    const [p] = await db
      .select({ id: polls.id, status: polls.status })
      .from(polls)
      .where(eq(polls.id, d.existingPollId))
      .limit(1);
    if (!p || p.status !== "open")
      return { error: "That poll isn't open — pick another." };
    pollId = p.id;
  } else if (d.pollMode === "new") {
    if (!d.pollQuestion || d.pollQuestion.trim().length === 0)
      return { error: "Give the poll a question first." };
    const options: PollOption[] = (d.pollOptions ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6)
      .map((label, i) => ({ id: `o${i + 1}`, label }));
    if (options.length < 2)
      return { error: "A poll needs at least two options." };
    pollId = await createPollRecord({
      question: d.pollQuestion.trim(),
      options,
      audience,
    });
  }

  const body = d.body?.trim() || null;
  const imageKey = d.imageKey?.trim() || null;
  const audioTrackId = d.audioTrackId || null;
  // A card with art or a track is a whisper too — words are no longer the only
  // way to say something.
  if (!body && !pollId && !imageKey && !audioTrackId)
    return { error: "Say something, or attach a poll, an image, or a track." };

  // Only carry the measurements when there's an image to measure.
  const imageW = imageKey ? d.imageW ?? null : null;
  const imageH = imageKey ? d.imageH ?? null : null;
  const imageFit = d.imageFit;

  // Scheduled: save it dark. publishedAt stays null so every feed query (which
  // filters on publishedAt) hides it until the worker fires it at `scheduledFor`.
  if (scheduledFor) {
    await db.insert(whispers).values({
      body,
      audience,
      pollId,
      imageKey,
      imageW,
      imageH,
      imageFit,
      audioTrackId,
      scheduledFor,
      publishedAt: null,
    });
    await logAudit(session.user.id, "whisper.scheduled", {
      audience: d.audienceType,
      poll: d.pollMode,
      image: Boolean(imageKey),
      audio: audioTrackId,
      scheduledFor: scheduledFor.toISOString(),
    });
    revalidatePath("/sanctum/whispers");
    return { ok: true, scheduled: true };
  }

  const [published] = await db
    .insert(whispers)
    .values({
      body,
      audience,
      pollId,
      imageKey,
      imageW,
      imageH,
      imageFit,
      audioTrackId,
      publishedAt: new Date(),
    })
    .returning({ id: whispers.id });

  // The SAME push path the scheduled worker uses (src/lib/feed/publish.ts).
  // Skipped entirely when she posts it silent — the card still lands in the
  // feed, nobody's phone lights up.
  if (d.silent !== "true") {
    await sendWhisperPush({
      body,
      pollId,
      audience,
      createdBy: session.user.id,
      whisperId: published?.id,
    });
  }

  await logAudit(session.user.id, "whisper.published", {
    audience: d.audienceType,
    poll: d.pollMode,
    image: Boolean(imageKey),
    audio: audioTrackId,
    silent: d.silent === "true",
  });
  revalidatePath("/sanctum/whispers");
  revalidatePath("/");
  return { ok: true };
}

const editSchema = z.object({
  whisperId: z.string().uuid(),
  body: z.string().max(500).optional(),
  audienceType: z.enum(["public", "all", "level", "oath", "user"]),
  level: z.coerce.number().int().min(0).max(99).optional(),
  userId: z.string().uuid().optional(),
  // Empty string is meaningful here: it means "take the picture off".
  imageKey: z.string().max(300),
  imageW: z.coerce.number().int().min(1).max(30000).optional(),
  imageH: z.coerce.number().int().min(1).max(30000).optional(),
  imageFit: z.enum(["natural", "wide", "square"]).default("natural"),
  audioTrackId: z.string().uuid().or(z.literal("")),
});

/**
 * Change a whisper that is already out there — its words, its picture and how
 * that picture sits, the file it points at, and above all WHO CAN SEE IT.
 *
 * That last one is why this exists. Before, the only fix for a whisper aimed at
 * the wrong audience was to delete it and speak again, which took its loves and
 * everything said beneath it with it. Now the reach can be narrowed or opened
 * in place, and nothing that was given under it is lost.
 *
 * No push is sent: an edit is not a new whisper, and nobody's phone should ring
 * twice for one. A poll it carries is left alone — votes are already cast
 * against it. Every edit is audited with what it was and what it became.
 */
export async function editWhisper(
  _prev: WhisperFormState,
  formData: FormData,
): Promise<WhisperFormState> {
  const session = await requireGoddess();
  const parsed = editSchema.safeParse({
    whisperId: formData.get("whisperId"),
    body: formData.get("body") || undefined,
    audienceType: formData.get("audienceType"),
    level: formData.get("level") || undefined,
    userId: formData.get("userId") || undefined,
    imageKey: formData.get("imageKey") ?? "",
    imageW: formData.get("imageW") || undefined,
    imageH: formData.get("imageH") || undefined,
    imageFit: formData.get("imageFit") || "natural",
    audioTrackId: formData.get("audioTrackId") ?? "",
  });
  if (!parsed.success) return { error: "That edit didn't hold together. Check the fields." };
  const d = parsed.data;

  const [before] = await db
    .select()
    .from(whispers)
    .where(eq(whispers.id, d.whisperId))
    .limit(1);
  if (!before) return { error: "That whisper is gone." };

  let audience: Audience;
  if (d.audienceType === "public") audience = { type: "public" };
  else if (d.audienceType === "all") audience = { type: "all" };
  else if (d.audienceType === "level")
    audience = { type: "level", level: d.level ?? 1 };
  else if (d.audienceType === "oath") audience = { type: "oath" };
  else {
    if (!d.userId) return { error: "Choose the one subject this is for." };
    audience = { type: "users", userIds: [d.userId] };
  }

  const body = d.body?.trim() || null;
  const imageKey = d.imageKey.trim() || null;
  const audioTrackId = d.audioTrackId || null;
  if (!body && !before.pollId && !imageKey && !audioTrackId)
    return { error: "A whisper can't be empty. Say something, or attach something." };

  await db
    .update(whispers)
    .set({
      body,
      audience,
      imageKey,
      imageW: imageKey ? d.imageW ?? null : null,
      imageH: imageKey ? d.imageH ?? null : null,
      imageFit: d.imageFit,
      audioTrackId,
    })
    .where(eq(whispers.id, d.whisperId));

  await logAudit(session.user.id, "whisper.edited", {
    whisperId: d.whisperId,
    audienceBefore: (before.audience as Audience).type,
    audienceAfter: d.audienceType,
    bodyChanged: (before.body ?? null) !== body,
    imageChanged: (before.imageKey ?? null) !== imageKey,
    fitBefore: before.imageFit,
    fitAfter: d.imageFit,
    audioBefore: before.audioTrackId,
    audioAfter: audioTrackId,
  });
  revalidatePath("/sanctum/whispers");
  revalidatePath(`/sanctum/whispers/${d.whisperId}`);
  revalidatePath("/");
  return { ok: true };
}

const pinSchema = z.object({
  whisperId: z.string().uuid(),
  pinned: z.enum(["true", "false"]),
});

/** Pin / unpin a whisper — pinned whispers sort first everywhere (R1). */
export async function setWhisperPinned(formData: FormData) {
  const session = await requireGoddess();
  const parsed = pinSchema.safeParse({
    whisperId: formData.get("whisperId"),
    pinned: formData.get("pinned"),
  });
  if (!parsed.success) throw new Error("Invalid pin");
  const pinned = parsed.data.pinned === "true";

  await db
    .update(whispers)
    .set({ pinned })
    .where(eq(whispers.id, parsed.data.whisperId));

  await logAudit(
    session.user.id,
    pinned ? "whisper.pinned" : "whisper.unpinned",
    { whisperId: parsed.data.whisperId },
  );
  revalidatePath("/sanctum/whispers");
  revalidatePath("/");
}

const cancelSchema = z.object({ whisperId: z.string().uuid() });

/** Cancel a scheduled whisper before it fires (R9.9a) — deletes it, but only
 *  while still unpublished, so a live whisper can never be nuked by this path. */
export async function cancelScheduledWhisper(formData: FormData) {
  const session = await requireGoddess();
  const parsed = cancelSchema.safeParse({
    whisperId: formData.get("whisperId"),
  });
  if (!parsed.success) throw new Error("Invalid cancel");

  const deleted = await db
    .delete(whispers)
    .where(
      and(eq(whispers.id, parsed.data.whisperId), isNull(whispers.publishedAt)),
    )
    .returning({ id: whispers.id });

  await logAudit(session.user.id, "whisper.scheduled_cancelled", {
    whisperId: parsed.data.whisperId,
    removed: deleted.length > 0,
  });
  revalidatePath("/sanctum/whispers");
}

/**
 * Take a whisper back — published or not. Loves and comments cascade with the
 * row, which is exactly why `editWhisper` exists: a whisper aimed at the wrong
 * audience should have its reach changed, not be destroyed along with
 * everything given under it. A poll it carried is left alone.
 */
export async function deleteWhisper(formData: FormData) {
  const session = await requireGoddess();
  const parsed = cancelSchema.safeParse({
    whisperId: formData.get("whisperId"),
  });
  if (!parsed.success) throw new Error("Invalid whisper");

  const removed = await db
    .delete(whispers)
    .where(eq(whispers.id, parsed.data.whisperId))
    .returning({ id: whispers.id });

  await logAudit(session.user.id, "whisper.deleted", {
    whisperId: parsed.data.whisperId,
    removed: removed.length > 0,
  });
  revalidatePath("/sanctum/whispers");
  revalidatePath("/");
}

// ── F3 · private comments under whispers ───────────────────────────────────

const replySchema = z.object({
  commentId: z.string().uuid(),
  whisperId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

/** She answers a subject's comment → a real message in their thread (with its
 *  disguise-aware push) + the comment's reply line. Audited against the subject. */
export async function replyToWhisperComment(formData: FormData) {
  const session = await requireGoddess();
  const parsed = replySchema.safeParse({
    commentId: formData.get("commentId"),
    whisperId: formData.get("whisperId"),
    body: formData.get("body"),
  });
  if (!parsed.success) throw new Error("Invalid reply");

  const result = await replyToComment(parsed.data.commentId, parsed.data.body);
  if (result.ok) {
    await logAudit(session.user.id, "whisper.comment_replied", {
      commentId: parsed.data.commentId,
      whisperId: parsed.data.whisperId,
      subjectUserId: result.userId,
    });
  }
  revalidatePath(`/sanctum/whispers/${parsed.data.whisperId}`);
  revalidatePath("/sanctum/whispers");
}

const deleteCommentSchema = z.object({
  commentId: z.string().uuid(),
  whisperId: z.string().uuid(),
});

/** She may take a subject's comment down — her prerogative, always audited. */
export async function deleteWhisperComment(formData: FormData) {
  const session = await requireGoddess();
  const parsed = deleteCommentSchema.safeParse({
    commentId: formData.get("commentId"),
    whisperId: formData.get("whisperId"),
  });
  if (!parsed.success) throw new Error("Invalid delete");

  const result = await deleteComment(parsed.data.commentId);
  await logAudit(session.user.id, "whisper.comment_deleted", {
    commentId: parsed.data.commentId,
    whisperId: parsed.data.whisperId,
    subjectUserId: result.ok ? result.userId : null,
    removed: result.ok,
  });
  revalidatePath(`/sanctum/whispers/${parsed.data.whisperId}`);
  revalidatePath("/sanctum/whispers");
}
