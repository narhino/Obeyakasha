"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  playlistItems,
  programItems,
  tracks,
} from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { enqueue } from "@/lib/jobs/queue";
import { parsePremiereInput } from "@/lib/premiere/logic";
import { notifySeriesTrackAdded } from "@/lib/series/notify";
import {
  addManualTag,
  approveKeyword,
  approveTrigger,
  dismissKeyword,
  dismissTrigger,
  removeTrackTag,
} from "@/lib/analyze/apply";
import { editTrigger } from "@/lib/organize/apply";

const tagKindSchema = z.enum([
  "purpose",
  "theme",
  "format",
  "intensity",
  "custom",
]);

function revalidate(trackId: string) {
  revalidatePath(`/sanctum/tracks/${trackId}`);
  revalidatePath("/sanctum/library");
}

export async function runAnalysisAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  await enqueue("analyze", { trackId }, { dedupeKey: `analyze:${trackId}` });
  revalidate(trackId);
}

export async function approveKeywordAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  const phrase = String(formData.get("phrase"));
  const tagKind = tagKindSchema.parse(formData.get("tagKind"));
  await approveKeyword(trackId, phrase, tagKind);
  revalidate(trackId);
}

export async function dismissKeywordAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  await dismissKeyword(
    trackId,
    String(formData.get("phrase")),
    String(formData.get("tagKind")),
  );
  revalidate(trackId);
}

// Approve a found trigger using HER edited values. `originalName` keys the
// finding in the ledger; `name` is what she actually approves (a partial name
// completed, a typo fixed). description/safetyNotes fill what the reading missed.
const approveTriggerSchema = z.object({
  trackId: z.string().uuid(),
  originalName: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  safetyNotes: z.string().max(4000).optional(),
});

export async function approveTriggerAction(formData: FormData) {
  const session = await requireGoddess();
  const input = approveTriggerSchema.parse({
    trackId: formData.get("trackId"),
    originalName: formData.get("originalName") ?? formData.get("name"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    safetyNotes: formData.get("safetyNotes") ?? undefined,
  });
  await approveTrigger(input.trackId, input.originalName, session.user.id, {
    name: input.name,
    description: input.description,
    safetyNotes: input.safetyNotes,
  });
  revalidate(input.trackId);
}

export async function dismissTriggerAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  await dismissTrigger(trackId, String(formData.get("name")));
  revalidate(trackId);
}

// Edit a shared trigger after it's applied — reshapes it everywhere it lives.
const editTriggerSchema = z.object({
  trackId: z.string().uuid(),
  triggerId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  safetyNotes: z.string().max(4000).optional(),
});

export async function editTriggerAction(formData: FormData) {
  const session = await requireGoddess();
  const input = editTriggerSchema.parse({
    trackId: formData.get("trackId"),
    triggerId: formData.get("triggerId"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    safetyNotes: formData.get("safetyNotes") ?? undefined,
  });
  await editTrigger(
    input.triggerId,
    {
      name: input.name,
      description: input.description ?? null,
      safetyNotes: input.safetyNotes ?? null,
    },
    session.user.id,
  );
  revalidate(input.trackId);
}

export async function addTagAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  const value = String(formData.get("value")).trim();
  if (!value) return;
  await addManualTag(trackId, tagKindSchema.parse(formData.get("kind")), value);
  revalidate(trackId);
}

export async function removeTagAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  await removeTrackTag(trackId, String(formData.get("tagId")));
  revalidate(trackId);
}

const descSchema = z.object({
  trackId: z.string().uuid(),
  description: z.string().max(4000),
});

export async function saveDescriptionAction(formData: FormData) {
  const session = await requireGoddess();
  const { trackId, description } = descSchema.parse({
    trackId: formData.get("trackId"),
    description: formData.get("description") ?? "",
  });
  await db
    .update(tracks)
    .set({ description, updatedAt: new Date() })
    .where(eq(tracks.id, trackId));
  await logAudit(session.user.id, "dossier.description_saved", { trackId });
  revalidate(trackId);
}

const premiereSchema = z.object({
  trackId: z.string().uuid(),
  premiereAt: z.string().optional(),
});

/**
 * Set / clear a track's premiere from the dossier (R9.6). Re-arms the
 * announcement (premiereAnnouncedAt = null) only when the moment actually
 * changes, so re-saving never re-fires "it's time" for a premiere already past.
 */
export async function setPremiereAction(formData: FormData) {
  const session = await requireGoddess();
  const { trackId, premiereAt: raw } = premiereSchema.parse({
    trackId: formData.get("trackId"),
    premiereAt: formData.get("premiereAt") ?? undefined,
  });
  const premiereAt = parsePremiereInput(raw);
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
      premiereAt,
      ...(changed ? { premiereAnnouncedAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tracks.id, trackId));
  await logAudit(session.user.id, "dossier.premiere_set", {
    trackId,
    premiereAt: premiereAt ? premiereAt.toISOString() : null,
  });
  revalidate(trackId);
}

export async function addToProgramAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  const programId = String(formData.get("programId"));
  if (!programId) return;
  // Avoid duplicate placement.
  const [exists] = await db
    .select({ id: programItems.id })
    .from(programItems)
    .where(
      and(
        eq(programItems.programId, programId),
        eq(programItems.trackId, trackId),
      ),
    )
    .limit(1);
  if (!exists) {
    await db.insert(programItems).values({ programId, trackId, sort: 0 });
    await logAudit(null, "dossier.added_to_program", { trackId, programId });
  }
  revalidate(trackId);
}

export async function removeFromProgramAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  const programId = String(formData.get("programId"));
  await db
    .delete(programItems)
    .where(
      and(
        eq(programItems.programId, programId),
        eq(programItems.trackId, trackId),
      ),
    );
  revalidate(trackId);
}

export async function addToPlaylistAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  const playlistId = String(formData.get("playlistId"));
  if (!playlistId) return;
  const [exists] = await db
    .select({ id: playlistItems.id })
    .from(playlistItems)
    .where(
      and(
        eq(playlistItems.playlistId, playlistId),
        eq(playlistItems.trackId, trackId),
      ),
    )
    .limit(1);
  if (!exists) {
    await db.insert(playlistItems).values({ playlistId, trackId, sort: 0 });
    await logAudit(null, "dossier.added_to_playlist", { trackId, playlistId });
    // R7: if this series is published, whisper the addition (deduped per series).
    await notifySeriesTrackAdded(playlistId);
  }
  revalidate(trackId);
}

export async function removeFromPlaylistAction(formData: FormData) {
  await requireGoddess();
  const trackId = String(formData.get("trackId"));
  const playlistId = String(formData.get("playlistId"));
  await db
    .delete(playlistItems)
    .where(
      and(
        eq(playlistItems.playlistId, playlistId),
        eq(playlistItems.trackId, trackId),
      ),
    );
  revalidate(trackId);
}
