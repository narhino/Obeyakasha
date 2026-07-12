"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks, transcripts } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/queue";

// Uploads now stream through POST /api/sanctum/upload (ROADMAP C1.2); the old
// buffered server-action upload was removed.

const metaSchema = z.object({
  trackId: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  minAccessLevel: z.coerce.number().int().min(0).max(99),
  durationS: z.coerce.number().int().min(0).optional(),
  downloadable: z.union([z.literal("on"), z.null()]).transform((v) => v === "on"),
});

/** Edit track metadata (title, description, access level, duration, downloadable). */
export async function updateTrackMeta(formData: FormData) {
  const session = await requireGoddess();
  const parsed = metaSchema.safeParse({
    trackId: formData.get("trackId"),
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    minAccessLevel: formData.get("minAccessLevel"),
    durationS: formData.get("durationS") || undefined,
    downloadable: formData.get("downloadable"),
  });
  if (!parsed.success) throw new Error("Invalid track metadata");
  const { trackId, ...set } = parsed.data;

  await db
    .update(tracks)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(tracks.id, trackId));
  await logAudit(session.user.id, "track.meta_updated", { trackId });
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
  await db
    .update(tracks)
    .set({
      visibility: visibility as "draft" | "published" | "archived",
      publishedAt: visibility === "published" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(tracks.id, trackId));
  await logAudit(session.user.id, "track.visibility", { trackId, visibility });
  revalidatePath("/sanctum/library");
}

/** Kick off transcription by enqueuing a durable job (ROADMAP C1.1). */
export async function requestTranscription(formData: FormData) {
  const session = await requireGoddess();
  const trackId = String(formData.get("trackId"));
  if (!trackId) throw new Error("No track");
  await logAudit(session.user.id, "transcript.requested", { trackId });
  // The worker picks this up within ~3s and marks the transcript processing.
  await enqueue("transcribe", { trackId }, { dedupeKey: `transcribe:${trackId}` });
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
