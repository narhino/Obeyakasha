import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  jobs,
  playlistItems,
  playlists,
  programItems,
  programs,
  tags,
  trackAnalysis,
  trackTags,
  trackTriggers,
  tracks,
  transcripts,
  triggers,
} from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { mediaProvider } from "@/lib/media";
import {
  analysisKeywordSchema,
  analysisTriggerSchema,
  type AnalysisKeyword,
  type AnalysisTrigger,
} from "@/lib/analyze/schema";
import { DossierClient } from "./DossierClient";

export const dynamic = "force-dynamic";

export default async function TrackDossier({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireGoddess();
  const { id } = await params;
  // A hand-typed non-UUID would throw 22P02 in Postgres — treat as not-found.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const [track] = await db
    .select()
    .from(tracks)
    .where(eq(tracks.id, id))
    .limit(1);
  if (!track) notFound();

  const [
    [transcript],
    [analysis],
    appliedTagRows,
    appliedTriggerRows,
    allPrograms,
    programPlacements,
    allPlaylists,
    playlistPlacements,
    [analyzeJob],
  ] = await Promise.all([
    db.select().from(transcripts).where(eq(transcripts.trackId, id)).limit(1),
    db.select().from(trackAnalysis).where(eq(trackAnalysis.trackId, id)).limit(1),
    db
      .select({ tagId: tags.id, kind: tags.kind, value: tags.value })
      .from(trackTags)
      .innerJoin(tags, eq(tags.id, trackTags.tagId))
      .where(eq(trackTags.trackId, id)),
    db
      .select({ name: triggers.name, relation: trackTriggers.relation })
      .from(trackTriggers)
      .innerJoin(triggers, eq(triggers.id, trackTriggers.triggerId))
      .where(eq(trackTriggers.trackId, id)),
    db.select({ id: programs.id, title: programs.title }).from(programs),
    db
      .select({ programId: programItems.programId })
      .from(programItems)
      .where(eq(programItems.trackId, id)),
    db.select({ id: playlists.id, title: playlists.title }).from(playlists),
    db
      .select({ playlistId: playlistItems.playlistId })
      .from(playlistItems)
      .where(eq(playlistItems.trackId, id)),
    db
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.dedupeKey, `analyze:${id}`))
      .orderBy(desc(jobs.createdAt))
      .limit(1),
  ]);

  // Is an analyze run already in flight? (seeds the dossier's live state)
  const analyzeJobActive =
    analyzeJob?.status === "queued" || analyzeJob?.status === "running";

  const streamUrl = track.streamKey
    ? await mediaProvider().signStreamUrl(track.streamKey, 6 * 60 * 60)
    : null;

  const keywords: AnalysisKeyword[] = ((analysis?.keywords as unknown[]) ?? [])
    .map((k) => analysisKeywordSchema.safeParse(k))
    .flatMap((r) => (r.success ? [r.data] : []));
  const trigs: AnalysisTrigger[] = ((analysis?.triggers as unknown[]) ?? [])
    .map((t) => analysisTriggerSchema.safeParse(t))
    .flatMap((r) => (r.success ? [r.data] : []));

  const inPrograms = new Set(programPlacements.map((p) => p.programId));
  const inPlaylists = new Set(playlistPlacements.map((p) => p.playlistId));

  return (
    <DossierClient
      track={{
        id: track.id,
        title: track.title,
        slug: track.slug,
        description: track.description,
        durationS: track.durationS,
        minAccessLevel: track.minAccessLevel,
        visibility: track.visibility,
        pipeline: track.pipeline,
        source: track.source,
        patreonPostId: track.patreonPostId,
        hasAudio: track.streamKey != null,
      }}
      streamUrl={streamUrl}
      transcript={
        transcript
          ? {
              status: transcript.status,
              fullText: transcript.fullText,
              segments: transcript.segments ?? [],
            }
          : null
      }
      dossier={
        analysis
          ? {
              model: analysis.model,
              summary: analysis.summary,
              keywords,
              triggers: trigs,
              suggestedDescription: analysis.suggestedDescription,
              intendedEffects: analysis.intendedEffects ?? [],
              safetyNotes: analysis.safetyNotes,
            }
          : null
      }
      appliedTags={appliedTagRows}
      appliedTriggerNames={appliedTriggerRows.map((t) => t.name.toLowerCase())}
      analysisUpdatedAt={analysis?.updatedAt ? analysis.updatedAt.toISOString() : null}
      analyzeJobActive={analyzeJobActive}
      programs={allPrograms.map((p) => ({
        ...p,
        contains: inPrograms.has(p.id),
      }))}
      playlists={allPlaylists.map((p) => ({
        ...p,
        contains: inPlaylists.has(p.id),
      }))}
    />
  );
}
