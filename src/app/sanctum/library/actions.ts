"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, tracks, transcripts } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/queue";
import { mediaProvider } from "@/lib/media";
import { broadcast } from "@/lib/push/broadcast";
import { parsePremiereInput } from "@/lib/premiere/logic";
import { copy } from "@/copy/copy";

// Uploads now stream through POST /api/sanctum/upload (ROADMAP C1.2); the old
// buffered server-action upload was removed.

const metaSchema = z.object({
  trackId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  minAccessLevel: z.coerce.number().int().min(0).max(99),
  durationS: z.coerce.number().int().min(0).optional(),
  downloadable: z.union([z.literal("on"), z.null()]).transform((v) => v === "on"),
  // R9.6: optional premiere datetime (datetime-local "YYYY-MM-DDTHH:mm"). Empty
  // clears it. Handled outside the object set so it can re-arm the announcement.
  premiereAt: z.string().optional(),
});

/** Edit track metadata (title, description, access level, duration, downloadable, premiere). */
export async function updateTrackMeta(formData: FormData) {
  const session = await requireGoddess();
  const parsed = metaSchema.safeParse({
    trackId: formData.get("trackId"),
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    minAccessLevel: formData.get("minAccessLevel"),
    durationS: formData.get("durationS") || undefined,
    downloadable: formData.get("downloadable"),
    premiereAt: formData.get("premiereAt") ?? undefined,
  });
  if (!parsed.success) throw new Error("Invalid track metadata");
  const { trackId, premiereAt: premiereRaw, ...set } = parsed.data;
  const premiereAt = parsePremiereInput(premiereRaw);

  // Re-arm the announcement only when the premiere is (re)scheduled to a new
  // moment — so saving unrelated edits never re-fires "it's time" for a premiere
  // that already passed and announced.
  const [before] = await db
    .select({ premiereAt: tracks.premiereAt })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  const changed =
    (before?.premiereAt?.getTime() ?? null) !== (premiereAt?.getTime() ?? null);

  await db
    .update(tracks)
    .set({
      ...set,
      premiereAt,
      ...(changed ? { premiereAnnouncedAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tracks.id, trackId));
  await logAudit(session.user.id, "track.meta_updated", {
    trackId,
    premiereAt: premiereAt ? premiereAt.toISOString() : null,
  });
  revalidatePath("/sanctum/library");
}

/** Publish / unpublish / archive a track. */
export async function setTrackVisibility(formData: FormData) {
  const session = await requireGoddess();
  const trackId = String(formData.get("trackId"));
  const visibility = String(formData.get("visibility"));
  if (!["draft", "published", "archived"].includes(visibility)) {
    throw new Error("Invalid visibility");
  }
  // Read the prior state first — a null publishedAt marks a first-ever publish,
  // which is the only transition that should announce the file (R7).
  const [before] = await db
    .select({
      publishedAt: tracks.publishedAt,
      minAccessLevel: tracks.minAccessLevel,
      slug: tracks.slug,
      title: tracks.title,
      premiereAt: tracks.premiereAt,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);

  const now = new Date();
  const firstPublish =
    visibility === "published" && before != null && before.publishedAt === null;
  // R9.6: a future premiere seals the track — the premiere announcement (worker
  // tick) replaces the immediate new-file push. A premiere already in the past
  // at publish plays now; stamp it announced so the tick doesn't also fire.
  const premiereFuture =
    before?.premiereAt != null && before.premiereAt.getTime() > now.getTime();
  const stampPremiereAnnounced =
    firstPublish && before?.premiereAt != null && !premiereFuture;

  await db
    .update(tracks)
    .set({
      visibility: visibility as "draft" | "published" | "archived",
      publishedAt: visibility === "published" ? now : undefined,
      ...(stampPremiereAnnounced ? { premiereAnnouncedAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(tracks.id, trackId));
  await logAudit(session.user.id, "track.visibility", { trackId, visibility });

  // R7: first publish → whisper it to everyone at or above its depth. Guarded on
  // publishedAt-was-null so unpublish→republish never re-pushes the same file.
  // R9.6: suppressed when a future premiere is set — the premiere push replaces it.
  if (firstPublish && before && !premiereFuture) {
    await broadcast({
      title: copy.library.newFilePush,
      body: before.title,
      deepLink: `/library/track/${before.slug}`,
      audience: { type: "level", level: before.minAccessLevel },
      kind: "manual",
      createdBy: session.user.id,
    });
  }
  revalidatePath("/sanctum/library");
}

/** Flag / unflag a track as a public free sample (R9.8). Audited. */
export async function setFreeSample(formData: FormData) {
  const session = await requireGoddess();
  const trackId = String(formData.get("trackId"));
  if (!trackId) throw new Error("No track");
  const freeSample = String(formData.get("freeSample")) === "true";
  await db
    .update(tracks)
    .set({ freeSample, updatedAt: new Date() })
    .where(eq(tracks.id, trackId));
  await logAudit(session.user.id, "track.free_sample", { trackId, freeSample });
  revalidatePath("/sanctum/library");
}

/** Kick off transcription by enqueuing a durable job (ROADMAP C1.1). */
export async function requestTranscription(formData: FormData) {
  const session = await requireGoddess();
  const trackId = String(formData.get("trackId"));
  if (!trackId) throw new Error("No track");
  await logAudit(session.user.id, "transcript.requested", { trackId });
  // The worker picks this up within ~3s and marks the transcript processing.
  await enqueue(
    "transcribe",
    { trackId },
    { dedupeKey: `transcribe:${trackId}`, maxAttempts: 5 },
  );
  revalidatePath("/sanctum/library");
}

/**
 * Transcribe everything that still needs it in one click: every track that has
 * audio but no finished transcript (never done, or previously failed). Enqueues
 * one durable job each; the worker grinds through them ONE AT A TIME (transcribe
 * concurrency is 1) so a big batch never overwhelms the CPU/memory — it just
 * takes as long as it takes, retrying transient failures on its own. The dedupe
 * key means already-queued tracks are not double-enqueued. Returns the count so
 * the UI can say how many were set going.
 */
export async function transcribeAllPending(): Promise<{ queued: number }> {
  const session = await requireGoddess();
  const rows = await db
    .select({ id: tracks.id, fullText: transcripts.fullText })
    .from(tracks)
    .leftJoin(transcripts, eq(transcripts.trackId, tracks.id))
    .where(isNotNull(tracks.streamKey));
  // Anything without a REAL script: no transcript row, or a row with empty text
  // (old stub-era "done" rows). Trust the text, not the status.
  const pending = rows
    .filter((r) => !r.fullText || r.fullText.trim().length === 0)
    .map((r) => r.id);
  for (const trackId of pending) {
    await enqueue(
      "transcribe",
      { trackId },
      { dedupeKey: `transcribe:${trackId}`, maxAttempts: 5 },
    );
  }
  await logAudit(session.user.id, "transcript.requested_all", {
    queued: pending.length,
  });
  revalidatePath("/sanctum/library");
  return { queued: pending.length };
}

const deleteTrackSchema = z.object({ trackId: z.string().uuid() });

/**
 * Permanently delete a CATALOG track (goddess). Removes its stored audio +
 * artwork from media storage best-effort — a storage hiccup must never strand
 * the row undeletable, so each delete is guarded (mirrors `deleteUpload`). Drops
 * any durable jobs still referencing the track (jsonb payload, no FK) so the
 * worker never wakes to transcribe/organize a track that's gone, then deletes
 * the row. Every association either cascades (tags, triggers, transcript,
 * analysis, playlist/program items, listens, offline grants) or SET-NULLs (a
 * whisper's attached track, a shipped/delivered commission track, a trigger's
 * provenance) via the schema — see migration 0019. Personal uploads are NOT
 * reachable here (the Library feed lists only catalog rows); those go through
 * `deleteUpload` on "Their files".
 */
export async function deleteTrack(formData: FormData) {
  const session = await requireGoddess();
  const parsed = deleteTrackSchema.safeParse({
    trackId: formData.get("trackId"),
  });
  if (!parsed.success) throw new Error("Invalid track");
  const { trackId } = parsed.data;

  const [row] = await db
    .select({
      title: tracks.title,
      storageKey: tracks.storageKey,
      streamKey: tracks.streamKey,
      artworkKey: tracks.artworkKey,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) throw new Error("No such track");

  const provider = mediaProvider();
  for (const key of [row.streamKey, row.storageKey, row.artworkKey]) {
    if (key) await provider.delete(key).catch(() => {});
  }

  // No FK from jobs → tracks; the trackId lives in the jsonb payload, so prune
  // matching jobs explicitly before the row goes.
  await db.delete(jobs).where(sql`payload->>'trackId' = ${trackId}`);

  await db.delete(tracks).where(eq(tracks.id, trackId));

  await logAudit(session.user.id, "track.deleted", {
    trackId,
    title: row.title,
  });
  revalidatePath("/sanctum/library");
}

/** Save Akasha's edits to a transcript (fixing mishears). PLAN §8.2. */
export async function saveTranscript(formData: FormData) {
  const session = await requireGoddess();
  const trackId = String(formData.get("trackId"));
  const fullText = String(formData.get("fullText") ?? "");
  await db
    .update(transcripts)
    .set({ fullText, updatedAt: new Date() })
    .where(eq(transcripts.trackId, trackId));
  await logAudit(session.user.id, "transcript.edited", { trackId });
  revalidatePath("/sanctum/library");
}
