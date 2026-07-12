import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { trackTags, tracks, transcripts } from "@/lib/db/schema";
import { withGoddess } from "@/lib/api";
import type { LibraryRow } from "@/app/sanctum/library/types";

/**
 * Reactive library feed (ROADMAP-v1.5 C1.4). The Sanctum library polls this to
 * keep statuses live without page refreshes. Goddess-only.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return withGoddess(async () => {
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
        streamKey: tracks.streamKey,
        transcriptStatus: transcripts.status,
      })
      .from(tracks)
      .leftJoin(transcripts, eq(transcripts.trackId, tracks.id))
      .orderBy(desc(tracks.createdAt));

    const counts = await db
      .select({ trackId: trackTags.trackId, n: sql<number>`count(*)::int` })
      .from(trackTags)
      .groupBy(trackTags.trackId);
    const tagMap = new Map(counts.map((c) => [c.trackId, Number(c.n)]));

    const library: LibraryRow[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      description: r.description,
      visibility: r.visibility,
      minAccessLevel: r.minAccessLevel,
      durationS: r.durationS,
      downloadable: r.downloadable,
      hasAudio: r.streamKey != null,
      transcriptStatus: (r.transcriptStatus ??
        "none") as LibraryRow["transcriptStatus"],
      tagCount: tagMap.get(r.id) ?? 0,
    }));
    return { tracks: library };
  });
}
