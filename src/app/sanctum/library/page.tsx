import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { trackTags, tracks, transcripts } from "@/lib/db/schema";
import { Display, Whisper } from "@/components/ui";
import { LibraryClient } from "./LibraryClient";
import type { LibraryRow } from "./types";

/**
 * Sanctum Library (ROADMAP-v1.5 C1.2 + C1.4). Server-renders the first paint,
 * then the client keeps it live: streaming uploads with progress bars and a
 * self-refreshing table — no manual refresh anywhere.
 */
export const dynamic = "force-dynamic";

export default async function SanctumLibrary() {
  const rows = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      slug: tracks.slug,
      description: tracks.description,
      visibility: tracks.visibility,
      minAccessLevel: tracks.minAccessLevel,
      durationS: tracks.durationS,
      downloadable: tracks.downloadable,
      freeSample: tracks.freeSample,
      streamKey: tracks.streamKey,
      pipeline: tracks.pipeline,
      transcriptStatus: transcripts.status,
    })
    .from(tracks)
    .leftJoin(transcripts, eq(transcripts.trackId, tracks.id))
    .orderBy(desc(tracks.createdAt));

  const counts = rows.length
    ? await db
        .select({ trackId: trackTags.trackId, n: sql<number>`count(*)::int` })
        .from(trackTags)
        .groupBy(trackTags.trackId)
    : [];
  const tagMap = new Map(counts.map((c) => [c.trackId, Number(c.n)]));

  const initial: LibraryRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    visibility: r.visibility,
    minAccessLevel: r.minAccessLevel,
    durationS: r.durationS,
    downloadable: r.downloadable,
    freeSample: r.freeSample,
    hasAudio: r.streamKey != null,
    pipeline: r.pipeline,
    transcriptStatus: (r.transcriptStatus ??
      "none") as LibraryRow["transcriptStatus"],
    tagCount: tagMap.get(r.id) ?? 0,
  }));

  return (
    <div className="max-w-3xl">
      <Display className="text-3xl">Library</Display>
      <Whisper className="mt-1">
        Drop audio, set its level, publish. Uploads show progress and the list
        stays live — no refreshing.
      </Whisper>

      <LibraryClient initial={initial} />
    </div>
  );
}
