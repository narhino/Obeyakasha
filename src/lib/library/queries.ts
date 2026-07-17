import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  grants,
  listenSessions,
  playlistItems,
  playlists,
  programItems,
  programs,
  resumePoints,
  tags,
  trackTags,
  trackTriggers,
  tracks,
  transcripts,
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

/** A catalog card: a library track plus why it surfaced in a search. */
export type CatalogTrack = LibraryTrack & {
  /** Surfaced ONLY because the query is spoken in the audio (privacy: the
   *  transcript itself is never returned — this is just an indicator). */
  matchedOnlyTranscript: boolean;
};

// ── Shared annotation ──────────────────────────────────────────────────────

/** Published tracks + the viewer's privately-granted ones (rows only). */
async function fetchBaseTrackRows(granted: Set<string>) {
  return db
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
}

/** Annotate track rows with tags, per-subject lock state, and prereqs. */
async function annotateTracks(
  rows: (typeof tracks.$inferSelect)[],
  opts: { userId: string | null; accessLevel: number; granted: Set<string> },
): Promise<LibraryTrack[]> {
  if (rows.length === 0) return [];
  const { userId, accessLevel, granted } = opts;
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
    userId
      ? db
          .select({ triggerId: userTriggers.triggerId })
          .from(userTriggers)
          .where(eq(userTriggers.userId, userId))
      : Promise.resolve([] as { triggerId: string }[]),
  ]);

  const heldNames = new Set<string>();
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

/** All published tracks + privately-granted ones, annotated per subject. */
export async function listLibraryTracks(
  userId: string,
  accessLevel: number,
): Promise<LibraryTrack[]> {
  const granted = await grantedTrackIds(userId);
  const rows = await fetchBaseTrackRows(granted);
  return annotateTracks(rows, { userId, accessLevel, granted });
}

// ── Public catalog + smart search (R2a) ─────────────────────────────────────

export interface CatalogViewer {
  /** null when logged-out — the whole catalog is browsable, nothing plays. */
  userId: string | null;
  /** 0 for anonymous / frozen viewers. */
  accessLevel: number;
}

export interface CatalogQuery {
  q?: string;
  /** Selected tag ids: AND across kinds, OR within a kind. */
  tagIds?: string[];
}

export interface CatalogResult {
  tracks: CatalogTrack[];
  /** Non-null → the query found nothing exact; `tracks` is a soft shelf. */
  fallback: "related" | "popular" | null;
}

/** pg_trgm similarity floor for "similar words" fuzzy matching. */
const SIMILARITY_THRESHOLD = 0.25;
const POPULAR_LIMIT = 12;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escape ILIKE wildcards so a subject's literal % or _ stays literal. */
function likeContains(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Track ids whose (admin-only) transcript speaks the query. Never returns text. */
async function transcriptMatchIds(
  ids: string[],
  q: string,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ trackId: transcripts.trackId })
    .from(transcripts)
    .innerJoin(tracks, eq(tracks.id, transcripts.trackId))
    .where(
      and(
        inArray(transcripts.trackId, ids),
        eq(tracks.visibility, "published"),
        sql`(${transcripts.fullText} ILIKE ${likeContains(q)} OR similarity(${transcripts.fullText}, ${q}) > ${SIMILARITY_THRESHOLD})`,
      ),
    );
  return new Set(rows.map((r) => r.trackId));
}

/** Track ids fuzzily matching title/description, best similarity first. */
async function fuzzyMatchOrderedIds(
  ids: string[],
  q: string,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const score = sql<number>`GREATEST(similarity(${tracks.title}, ${q}), similarity(COALESCE(${tracks.description}, ''), ${q}))`;
  const rows = await db
    .select({ id: tracks.id, score })
    .from(tracks)
    .where(and(inArray(tracks.id, ids), sql`${score} > ${SIMILARITY_THRESHOLD}`))
    .orderBy(desc(score));
  return rows.map((r) => r.id);
}

/** Play counts for a set of tracks (drives the most-played fallback shelf). */
async function playCountsFor(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      trackId: listenSessions.trackId,
      n: sql<number>`count(*)::int`,
    })
    .from(listenSessions)
    .where(inArray(listenSessions.trackId, ids))
    .groupBy(listenSessions.trackId);
  return new Map(rows.map((r) => [r.trackId, r.n]));
}

function matchesText(t: LibraryTrack, ql: string): boolean {
  if (t.title.toLowerCase().includes(ql)) return true;
  if (t.description && t.description.toLowerCase().includes(ql)) return true;
  return t.tags.some((tag) => tag.value.toLowerCase().includes(ql));
}

/**
 * The public catalog with tag filters + progressive-fallback smart search.
 * Order: exact/ILIKE → pg_trgm fuzzy → transcript-only → related/popular so
 * results are effectively never empty. Runs identically logged-out.
 */
export async function listCatalogTracks(
  viewer: CatalogViewer,
  query: CatalogQuery = {},
): Promise<CatalogResult> {
  const granted = viewer.userId
    ? await grantedTrackIds(viewer.userId)
    : new Set<string>();
  const rows = await fetchBaseTrackRows(granted);
  const baseAll = await annotateTracks(rows, {
    userId: viewer.userId,
    accessLevel: viewer.accessLevel,
    granted,
  });

  // Tag filter: AND across kinds, OR within a kind. Ignore non-uuid ids so a
  // hand-crafted ?tags= never reaches an invalid uuid cast.
  const tagIds = (query.tagIds ?? []).filter((id) => UUID_RE.test(id));
  const selectedByKind = new Map<string, Set<string>>();
  if (tagIds.length > 0) {
    const selected = await db
      .select({ kind: tags.kind, value: tags.value })
      .from(tags)
      .where(inArray(tags.id, tagIds));
    for (const s of selected) {
      const set = selectedByKind.get(s.kind) ?? new Set<string>();
      set.add(s.value);
      selectedByKind.set(s.kind, set);
    }
  }
  const hasTagFilter = selectedByKind.size > 0;
  const tagFiltered = hasTagFilter
    ? baseAll.filter((t) =>
        [...selectedByKind.entries()].every(([kind, values]) =>
          t.tags.some((tag) => tag.kind === kind && values.has(tag.value)),
        ),
      )
    : baseAll;

  const withFlag = (
    list: LibraryTrack[],
    matchedOnlyTranscript: boolean,
  ): CatalogTrack[] => list.map((t) => ({ ...t, matchedOnlyTranscript }));

  const q = (query.q ?? "").trim();

  // No free-text: just the tag-filtered set (fall to popular if it's empty).
  if (q === "") {
    if (tagFiltered.length > 0) {
      return { tracks: withFlag(tagFiltered, false), fallback: null };
    }
    const playCountsCache = await playCountsFor(baseAll.map((t) => t.id));
    const sorted = [...baseAll].sort(
      (a, b) => (playCountsCache.get(b.id) ?? 0) - (playCountsCache.get(a.id) ?? 0),
    );
    if (sorted.length === 0) return { tracks: [], fallback: null };
    return {
      tracks: withFlag(sorted.slice(0, POPULAR_LIMIT), false),
      fallback: "popular",
    };
  }

  const pool = tagFiltered;
  const poolIds = pool.map((t) => t.id);
  const ql = q.toLowerCase();

  // Transcript matches (published only) augment whatever metadata match wins.
  const transcriptIds = await transcriptMatchIds(poolIds, q);
  const augmentTranscriptOnly = (primary: LibraryTrack[]): CatalogTrack[] => {
    const primaryIds = new Set(primary.map((t) => t.id));
    const extra = pool.filter(
      (t) => transcriptIds.has(t.id) && !primaryIds.has(t.id),
    );
    return [...withFlag(primary, false), ...withFlag(extra, true)];
  };

  // (a) exact / ILIKE on title + description + tag values.
  const exact = pool.filter((t) => matchesText(t, ql));
  if (exact.length > 0) {
    return { tracks: augmentTranscriptOnly(exact), fallback: null };
  }

  // (b) pg_trgm fuzzy on title + description.
  const fuzzyIds = await fuzzyMatchOrderedIds(poolIds, q);
  if (fuzzyIds.length > 0) {
    const byId = new Map(pool.map((t) => [t.id, t]));
    const fuzzy = fuzzyIds
      .map((id) => byId.get(id))
      .filter((t): t is LibraryTrack => !!t);
    return { tracks: augmentTranscriptOnly(fuzzy), fallback: null };
  }

  // (c) transcript-only matches stand on their own.
  if (transcriptIds.size > 0) {
    const spoken = pool.filter((t) => transcriptIds.has(t.id));
    return { tracks: withFlag(spoken, true), fallback: null };
  }

  // (d) nothing exact → related tags, then most-played.
  if (hasTagFilter && tagFiltered.length > 0) {
    return { tracks: withFlag(tagFiltered, false), fallback: "related" };
  }
  const playCountsCache = await playCountsFor(baseAll.map((t) => t.id));
  const sorted = [...baseAll].sort(
    (a, b) => (playCountsCache.get(b.id) ?? 0) - (playCountsCache.get(a.id) ?? 0),
  );
  if (sorted.length === 0) return { tracks: [], fallback: null };
  return {
    tracks: withFlag(sorted.slice(0, POPULAR_LIMIT), false),
    fallback: "popular",
  };
}

export interface TagGroup {
  kind: string;
  tags: { id: string; value: string }[];
}

/** Filter chips: tags actually used by published tracks, grouped by kind. */
export async function listTagGroups(): Promise<TagGroup[]> {
  const rows = await db
    .selectDistinct({ id: tags.id, kind: tags.kind, value: tags.value })
    .from(tags)
    .innerJoin(trackTags, eq(trackTags.tagId, tags.id))
    .innerJoin(tracks, eq(tracks.id, trackTags.trackId))
    .where(
      and(
        eq(tracks.visibility, "published"),
        inArray(tags.kind, ["purpose", "theme", "format", "intensity"]),
      ),
    )
    .orderBy(asc(tags.kind), asc(tags.value));

  const order = ["purpose", "theme", "format", "intensity"];
  const byKind = new Map<string, { id: string; value: string }[]>();
  for (const r of rows) {
    const list = byKind.get(r.kind) ?? [];
    list.push({ id: r.id, value: r.value });
    byKind.set(r.kind, list);
  }
  return order
    .filter((k) => byKind.has(k))
    .map((kind) => ({ kind, tags: byKind.get(kind)! }));
}

// ── Series segment (R2a) ────────────────────────────────────────────────────

export interface SeriesCard {
  kind: "training" | "series";
  id: string;
  title: string;
  count: number;
  cadence: "ongoing" | "weekly" | "ended" | null;
  href: string;
}

async function countByProgram(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: programItems.programId, n: sql<number>`count(*)::int` })
    .from(programItems)
    .where(inArray(programItems.programId, ids))
    .groupBy(programItems.programId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

async function countByPlaylist(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: playlistItems.playlistId, n: sql<number>`count(*)::int` })
    .from(playlistItems)
    .where(inArray(playlistItems.playlistId, ids))
    .groupBy(playlistItems.playlistId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/**
 * Series segment cards: published trainings (programs) + published curated
 * series (playlists). Titles/counts are public; nothing is hidden. Trainings
 * link to /programs; series link to their R2a stub page.
 */
export async function listSeriesCards(): Promise<SeriesCard[]> {
  const [progs, pls] = await Promise.all([
    db
      .select()
      .from(programs)
      .where(eq(programs.visibility, "published"))
      .orderBy(asc(programs.createdAt)),
    db
      .select()
      .from(playlists)
      .where(
        and(
          eq(playlists.visibility, "published"),
          eq(playlists.kind, "curated"),
        ),
      )
      .orderBy(desc(playlists.createdAt)),
  ]);

  const [progCounts, plCounts] = await Promise.all([
    countByProgram(progs.map((p) => p.id)),
    countByPlaylist(pls.map((p) => p.id)),
  ]);

  const trainingCards: SeriesCard[] = progs.map((p) => ({
    kind: "training",
    id: p.id,
    title: p.title,
    count: progCounts.get(p.id) ?? 0,
    cadence: p.cadence,
    href: "/programs",
  }));
  const seriesCards: SeriesCard[] = pls.map((p) => ({
    kind: "series",
    id: p.id,
    title: p.title,
    count: plCounts.get(p.id) ?? 0,
    cadence: null,
    href: `/library/series/${p.id}`,
  }));
  return [...trainingCards, ...seriesCards];
}

/** A single published curated series with its tracks (R4 stub, R2a). */
export async function getSeriesStub(
  playlistId: string,
  viewer: CatalogViewer,
): Promise<{ title: string; description: string | null; tracks: LibraryTrack[] } | null> {
  const [pl] = await db
    .select()
    .from(playlists)
    .where(
      and(
        eq(playlists.id, playlistId),
        eq(playlists.visibility, "published"),
      ),
    )
    .limit(1);
  if (!pl) return null;

  const items = await db
    .select({ track: tracks, sort: playlistItems.sort })
    .from(playlistItems)
    .innerJoin(tracks, eq(tracks.id, playlistItems.trackId))
    .where(eq(playlistItems.playlistId, playlistId));

  const granted = viewer.userId
    ? await grantedTrackIds(viewer.userId)
    : new Set<string>();
  const ordered = items
    .sort((a, b) => a.sort - b.sort)
    .map((i) => i.track)
    .filter((t) => t.visibility === "published" || granted.has(t.id));

  const annotated = await annotateTracks(ordered, {
    userId: viewer.userId,
    accessLevel: viewer.accessLevel,
    granted,
  });
  return { title: pl.title, description: pl.description, tracks: annotated };
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
