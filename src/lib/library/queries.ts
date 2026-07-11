import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  playlistItems,
  playlists,
  resumePoints,
  tags,
  trackTags,
  tracks,
} from "@/lib/db/schema";
import { canAccess } from "@/lib/entitlements/core";

export interface LibraryTrack {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  durationS: number | null;
  artworkKey: string | null;
  minAccessLevel: number;
  downloadable: boolean;
  kind: string;
  /** Whether this subject can play it at their current access level. */
  unlocked: boolean;
  tags: { kind: string; value: string }[];
}

/** All published tracks, each annotated with whether the subject can play it. */
export async function listLibraryTracks(
  accessLevel: number,
): Promise<LibraryTrack[]> {
  const rows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.visibility, "published"))
    .orderBy(desc(tracks.publishedAt));

  if (rows.length === 0) return [];

  const trackIds = rows.map((r) => r.id);
  const tagRows = await db
    .select({
      trackId: trackTags.trackId,
      kind: tags.kind,
      value: tags.value,
    })
    .from(trackTags)
    .innerJoin(tags, eq(tags.id, trackTags.tagId))
    .where(inArray(trackTags.trackId, trackIds));

  const tagsByTrack = new Map<string, { kind: string; value: string }[]>();
  for (const t of tagRows) {
    const list = tagsByTrack.get(t.trackId) ?? [];
    list.push({ kind: t.kind, value: t.value });
    tagsByTrack.set(t.trackId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    durationS: r.durationS,
    artworkKey: r.artworkKey,
    minAccessLevel: r.minAccessLevel,
    downloadable: r.downloadable,
    kind: r.kind,
    unlocked: canAccess(accessLevel, r.minAccessLevel),
    tags: tagsByTrack.get(r.id) ?? [],
  }));
}

/** A single track if the subject may access it, else null (for the stream endpoint). */
export async function getAccessibleTrack(
  trackId: string,
  accessLevel: number,
): Promise<typeof tracks.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.id, trackId), eq(tracks.visibility, "published")))
    .limit(1);
  if (!row) return null;
  if (!canAccess(accessLevel, row.minAccessLevel)) return null;
  return row;
}

/** Continue-listening: tracks the subject has a resume point in, most recent first. */
export async function continueListening(
  userId: string,
  accessLevel: number,
  limit = 10,
): Promise<{ track: LibraryTrack; positionS: number }[]> {
  const rows = await db
    .select({
      track: tracks,
      positionS: resumePoints.positionS,
      updatedAt: resumePoints.updatedAt,
    })
    .from(resumePoints)
    .innerJoin(tracks, eq(tracks.id, resumePoints.trackId))
    .where(
      and(
        eq(resumePoints.userId, userId),
        eq(tracks.visibility, "published"),
      ),
    )
    .orderBy(desc(resumePoints.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    positionS: r.positionS,
    track: {
      id: r.track.id,
      title: r.track.title,
      slug: r.track.slug,
      description: r.track.description,
      durationS: r.track.durationS,
      artworkKey: r.track.artworkKey,
      minAccessLevel: r.track.minAccessLevel,
      downloadable: r.track.downloadable,
      kind: r.track.kind,
      unlocked: canAccess(accessLevel, r.track.minAccessLevel),
      tags: [],
    },
  }));
}

export async function listPlaylistsWithTracks(accessLevel: number) {
  const pls = await db
    .select()
    .from(playlists)
    .where(eq(playlists.visibility, "published"));
  if (pls.length === 0) return [];
  const items = await db
    .select({
      playlistId: playlistItems.playlistId,
      track: tracks,
      sort: playlistItems.sort,
    })
    .from(playlistItems)
    .innerJoin(tracks, eq(tracks.id, playlistItems.trackId))
    .where(
      inArray(
        playlistItems.playlistId,
        pls.map((p) => p.id),
      ),
    );

  return pls.map((p) => ({
    ...p,
    tracks: items
      .filter((i) => i.playlistId === p.id)
      .sort((a, b) => a.sort - b.sort)
      .map((i) => ({
        id: i.track.id,
        title: i.track.title,
        durationS: i.track.durationS,
        minAccessLevel: i.track.minAccessLevel,
        unlocked: canAccess(accessLevel, i.track.minAccessLevel),
      })),
  }));
}
