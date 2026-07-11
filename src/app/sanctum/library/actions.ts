"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { ingestUpload } from "@/lib/media/ingest";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2GB (PLAN §7.2)

/** Upload one audio file → draft track (batch = call once per file). */
export async function uploadTrack(formData: FormData) {
  const session = await requireGoddess();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");
  if (file.size > MAX_BYTES) throw new Error("File exceeds 2GB");

  const title = (formData.get("title") as string | null) ?? undefined;
  const clientDurationRaw = formData.get("durationS");
  const clientDurationS =
    clientDurationRaw != null && clientDurationRaw !== ""
      ? Math.round(Number(clientDurationRaw))
      : null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await ingestUpload({
    filename: file.name,
    bytes,
    title,
    clientDurationS: Number.isFinite(clientDurationS as number)
      ? clientDurationS
      : null,
  });

  await logAudit(session.user.id, "track.uploaded", {
    trackId: result.trackId,
    filename: file.name,
    durationS: result.durationS,
  });
  revalidatePath("/sanctum/library");
}

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
