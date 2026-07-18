import { asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  playlistItems,
  playlists,
  programItems,
  programs,
  tracks,
} from "@/lib/db/schema";
import { mediaProvider } from "@/lib/media";
import { copy } from "@/copy/copy";
import { PageHeading, Whisper } from "@/components/ui";
import { SeriesSection } from "./SeriesSection";
import { TrainingsSection } from "./TrainingsSection";

// Covers are signed with short-lived URLs, so always render fresh.
export const dynamic = "force-dynamic";

const ART_TTL_S = 6 * 60 * 60;

async function signArt(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await mediaProvider().signStreamUrl(key, ART_TTL_S);
  } catch {
    return null;
  }
}

export default async function SanctumCollections() {
  const [seriesRows, progs, publishedTracks] = await Promise.all([
    db
      .select()
      .from(playlists)
      .where(eq(playlists.kind, "curated"))
      .orderBy(asc(playlists.createdAt)),
    db.select().from(programs).orderBy(asc(programs.createdAt)),
    db
      .select({ id: tracks.id, title: tracks.title })
      .from(tracks)
      .where(ne(tracks.visibility, "archived"))
      .orderBy(asc(tracks.title)),
  ]);

  const [seriesItems, programItemRows] = await Promise.all([
    seriesRows.length
      ? db
          .select({
            id: playlistItems.id,
            playlistId: playlistItems.playlistId,
            trackId: playlistItems.trackId,
            sort: playlistItems.sort,
            title: tracks.title,
          })
          .from(playlistItems)
          .innerJoin(tracks, eq(tracks.id, playlistItems.trackId))
          .where(
            inArray(
              playlistItems.playlistId,
              seriesRows.map((p) => p.id),
            ),
          )
      : Promise.resolve([]),
    progs.length
      ? db
          .select({
            programId: programItems.programId,
            trackId: programItems.trackId,
            dayNumber: programItems.dayNumber,
            sort: programItems.sort,
            title: tracks.title,
          })
          .from(programItems)
          .innerJoin(tracks, eq(tracks.id, programItems.trackId))
          .where(
            inArray(
              programItems.programId,
              progs.map((p) => p.id),
            ),
          )
      : Promise.resolve([]),
  ]);

  const artByPlaylist = new Map<string, string | null>(
    await Promise.all(
      seriesRows.map(
        async (p) =>
          [p.id, await signArt(p.artworkKey)] as [string, string | null],
      ),
    ),
  );

  return (
    <div className="max-w-3xl">
      <PageHeading eyebrow="Catalog">Collections</PageHeading>
      <Whisper className="mt-1">
        The two ways you shape a queue: curated Series and sequential Trainings.
      </Whisper>

      <div className="mt-8 space-y-12">
        <SeriesSection
          rows={seriesRows}
          items={seriesItems}
          publishedTracks={publishedTracks}
          artByPlaylist={artByPlaylist}
          mark={copy.brand.mark}
        />
        <TrainingsSection
          progs={progs}
          items={programItemRows}
          publishedTracks={publishedTracks}
        />
      </div>
    </div>
  );
}
