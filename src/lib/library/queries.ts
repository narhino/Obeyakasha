import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  grants,
  playlistItems,
  playlists,
  resumePoints,
  tags,
  trackTags,
  trackTriggers,
  tracks,
  triggers,
  userTriggers,
} from "@/lib/db/schema";
import { canAccess } from "@/lib/entitlements/core";

/** Track ids granted directly to a user (commission deliveries, gifts). */
export async function grantedTrackIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ trackId: grants.trackId })
    .from(grants)
    .where(eq(grants.userId, userId));
  return new Set(rows.map((r) => r.trackId).filter((x): x is string => !!x));
}

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
  /** Privately delivered to this subject (commission). */
  madeForYou: boolean;
  /** Required triggers the subject hasn't earned yet (soft gate, A5). */
  prereqMissing: string[];
  tags: { kind: string; value: string }[];
}

/** All published tracks + privately-granted ones, annotated per subject. */
export async function listLibraryTracks(
  userId: string,
  accessLevel: number,
): Promise<LibraryTrack[]> {
  const granted = await grantedTrackIds(userId);
  const rows = await db
    .select()
    .from(tracks)
    .where(
      granted.size > 0
        ? or(
            eq(tracks.visibility, "published"),
            inArray(tracks.id, [...granted]),
          )
        : eq(tracks.visibility, "published"),
    )
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

  // Prerequisite triggers (relation 'requires') vs the subject's vault (A5).
  const [reqRows, held] = await Promise.all([
    db
      .select({ trackId: trackTriggers.trackId, name: triggers.name })
      .from(trackTriggers)
      .innerJoin(triggers, eq(triggers.id, trackTriggers.triggerId))
      .where(
        and(
          inArray(trackTriggers.trackId, trackIds),
          eq(trackTriggers.relation, "requires"),
        ),
      ),
    db
      .select({ triggerId: userTriggers.triggerId })
      .from(userTriggers)
      .where(eq(userTriggers.userId, userId)),
  ]);
  const heldNames = new Set<string>();
  // Map held trigger ids → names via reqRows is insufficient; fetch names.
  if (held.length > 0) {
    const heldRows = await db
      .select({ name: triggers.name })
      .from(triggers)
      .where(
        inArray(
          triggers.id,
          held.map((h) => h.triggerId),
        ),
      );
    for (const h of heldRows) heldNames.add(h.name);
  }
  const requiredByTrack = new Map<string, string[]>();
  for (const r of reqRows) {
    const list = requiredByTrack.get(r.trackId) ?? [];
    list.push(r.name);
    requiredByTrack.set(r.trackId, list);
  }

  return rows.map((r) => {
    const isGranted = granted.has(r.id);
    const required = requiredByTrack.get(r.id) ?? [];
    const prereqMissing = required.filter((n) => !heldNames.has(n));
    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      description: r.description,
      durationS: r.durationS,
      artworkKey: r.artworkKey,
      minAccessLevel: r.minAccessLevel,
      downloadable: r.downloadable,
      kind: r.kind,
      unlocked: isGranted || canAccess(accessLevel, r.minAccessLevel),
      madeForYou: isGranted,
      prereqMissing,
      tags: tagsByTrack.get(r.id) ?? [],
    };
  });
}

/** A single track if the subject may access it, else null (for the stream endpoint). */
export async function getAccessibleTrack(
  trackId: string,
  userId: string,
  accessLevel: number,
): Promise<typeof tracks.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) return null;
  const granted = await grantedTrackIds(userId);
  if (granted.has(trackId)) return row; // privately delivered
  if (row.visibility !== "published") return null;
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
      madeForYou: false,
      prereqMissing: [],
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
