"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks, transcripts } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/queue";
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
