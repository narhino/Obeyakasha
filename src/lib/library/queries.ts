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
import { mediaProvider } from "@/lib/media";

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
  /** Published free sample — playable by ANYONE, logged-out included (R9.8). */
  freeSample: boolean;
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
      freeSample: r.freeSample && r.visibility === "published",
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

/** pg_trgm-style trigrams: lowercased, split on non-alphanumerics, each word
 *  padded (two leading, one trailing space) — mirrors Postgres closely. */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** Jaccard trigram similarity in [0,1] — the same shape pg_trgm's similarity()
 *  returns, so SIMILARITY_THRESHOLD stays meaningful. */
function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of B) if (A.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * The fuzzy tier (F05): typo-tolerant match over title, description AND tag
 * values, best score first. Runs in memory over the already-loaded pool so a
 * one-character typo ("chastty") still reaches a track's "chastity" TAG — the
 * old DB tier only looked at title/description, so tag typos fell through to
 * the "popular" shelf and dumped unrelated files.
 */
function fuzzyMatches(pool: LibraryTrack[], q: string): LibraryTrack[] {
  return pool
    .map((t) => {
      const fields = [
        t.title,
        t.description ?? "",
        ...t.tags.map((tag) => tag.value),
      ];
      const score = Math.max(...fields.map((f) => trigramSimilarity(f, q)));
      return { t, score };
    })
    .filter((x) => x.score > SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
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

  // (b) typo-tolerant fuzzy on title + description + tag values (F05).
  const fuzzy = fuzzyMatches(pool, q);
  if (fuzzy.length > 0) {
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
    cadence: p.cadence,
    href: `/library/series/${p.id}`,
  }));
  return [...trainingCards, ...seriesCards];
}

export interface SeriesPage {
  title: string;
  description: string | null;
  cadence: "ongoing" | "weekly" | "ended";
  /** Signed, short-lived cover URL (never a raw storage key); null if none. */
  artworkUrl: string | null;
  tracks: LibraryTrack[];
}

/** A single published curated series with its cover + tracks (R4). */
export async function getSeriesPage(
  playlistId: string,
  viewer: CatalogViewer,
): Promise<SeriesPage | null> {
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
  return {
    title: pl.title,
    description: pl.description,
    cadence: pl.cadence,
    artworkUrl: await signArtworkUrl(pl.artworkKey),
    tracks: annotated,
  };
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
      freeSample: r.track.freeSample && r.track.visibility === "published",
      unlocked: canAccess(accessLevel, r.track.minAccessLevel),
      madeForYou: false,
      prereqMissing: [],
      tags: [],
    },
  }));
}

/**
 * A track anyone may stream because it's a published free sample (R9.8).
 * Returns the row only when it's a published `freeSample` with playable audio —
 * the single place the stream endpoint may bypass the entitlement check for a
 * logged-out (or under-levelled) visitor. Never returns drafts or non-samples.
 */
export async function getSampleTrack(
  trackId: string,
): Promise<typeof tracks.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) return null;
  if (row.visibility !== "published" || !row.freeSample || !row.streamKey) {
    return null;
  }
  return row;
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

// ── Public file page (R3) ───────────────────────────────────────────────────

export interface FilePageTag {
  id: string;
  kind: string;
  value: string;
}

export interface FilePageTrigger {
  name: string;
  relation: "installs" | "reinforces" | "requires";
}

export interface FilePageCollection {
  kind: "series" | "training";
  id: string;
  title: string;
  href: string;
}

export interface TrackFilePage {
  /** Card-state annotation (unlocked / prereqs / madeForYou), reused from R2a. */
  track: LibraryTrack;
  /** Goddess-only: the track isn't published (draft/archived preview). */
  isDraftPreview: boolean;
  publishedAt: Date | null;
  /** Signed, short-lived artwork URL (never a raw storage key); null if none. */
  artworkUrl: string | null;
  /** Approved tag chips, grouped by kind (incl. custom), each linkable by id. */
  tagGroups: { kind: string; tags: FilePageTag[] }[];
  /** Names + relation only — never timestamps or evidence (privacy). */
  triggers: FilePageTrigger[];
  /** Series (curated playlists) + trainings (programs) it belongs to. */
  collections: FilePageCollection[];
  /** "After this": next-in-series (by sort) first, then shared-tag neighbours. */
  afterThis: LibraryTrack[];
}

const TAG_KIND_ORDER = ["purpose", "theme", "format", "intensity", "custom"];
const ARTWORK_TTL_S = 6 * 60 * 60;
const RAIL_NEXT_LIMIT = 4;
const RAIL_SHARED_LIMIT = 4;

/** Sign the artwork key with the existing media pattern; never expose the key. */
async function signArtworkUrl(artworkKey: string | null): Promise<string | null> {
  if (!artworkKey) return null;
  try {
    return await mediaProvider().signStreamUrl(artworkKey, ARTWORK_TTL_S);
  } catch {
    return null;
  }
}

/** Published title/description for generateMetadata — safe public fields only. */
export async function getTrackMetaBySlug(
  slug: string,
): Promise<{ title: string; description: string | null } | null> {
  const [row] = await db
    .select({
      title: tracks.title,
      description: tracks.description,
      visibility: tracks.visibility,
    })
    .from(tracks)
    .where(eq(tracks.slug, slug))
    .limit(1);
  if (!row || row.visibility !== "published") return null;
  return { title: row.title, description: row.description };
}

/**
 * The public per-file page (R3), shibbydex-shaped but approved-data-only.
 * Published tracks are visible to everyone (logged-out included); the goddess
 * may preview a draft. Never returns transcripts, analysis, salience,
 * evidence timestamps, or any other subject's data.
 */
export async function getTrackFilePage(
  slug: string,
  viewer: CatalogViewer,
  opts: { isGoddess?: boolean } = {},
): Promise<TrackFilePage | null> {
  const [row] = await db
    .select()
    .from(tracks)
    .where(eq(tracks.slug, slug))
    .limit(1);
  if (!row) return null;

  const isDraftPreview = row.visibility !== "published";
  if (isDraftPreview && !opts.isGoddess) return null;

  const granted = viewer.userId
    ? await grantedTrackIds(viewer.userId)
    : new Set<string>();

  // Primary track card-state (reuses the R2a annotation).
  const [track] = await annotateTracks([row], {
    userId: viewer.userId,
    accessLevel: viewer.accessLevel,
    granted,
  });
  if (!track) return null;

  // Tag chips (with ids, so each links to /library?tags=), grouped by kind.
  const tagRows = await db
    .select({ id: tags.id, kind: tags.kind, value: tags.value })
    .from(trackTags)
    .innerJoin(tags, eq(tags.id, trackTags.tagId))
    .where(eq(trackTags.trackId, row.id))
    .orderBy(asc(tags.value));
  const tagsByKind = new Map<string, FilePageTag[]>();
  for (const t of tagRows) {
    const list = tagsByKind.get(t.kind) ?? [];
    list.push({ id: t.id, kind: t.kind, value: t.value });
    tagsByKind.set(t.kind, list);
  }
  const tagGroups = TAG_KIND_ORDER.filter((k) => tagsByKind.has(k)).map(
    (kind) => ({ kind, tags: tagsByKind.get(kind)! }),
  );

  // Triggers mentioned — names + relation only (no timestamps, no evidence).
  const triggerRows = await db
    .select({ name: triggers.name, relation: trackTriggers.relation })
    .from(trackTriggers)
    .innerJoin(triggers, eq(triggers.id, trackTriggers.triggerId))
    .where(eq(trackTriggers.trackId, row.id));
  const triggersList: FilePageTrigger[] = triggerRows.map((t) => ({
    name: t.name,
    relation: t.relation,
  }));

  // Belongs-to: published curated series + published trainings.
  const [seriesRows, programRows] = await Promise.all([
    db
      .select({ id: playlists.id, title: playlists.title })
      .from(playlistItems)
      .innerJoin(playlists, eq(playlists.id, playlistItems.playlistId))
      .where(
        and(
          eq(playlistItems.trackId, row.id),
          eq(playlists.visibility, "published"),
          eq(playlists.kind, "curated"),
        ),
      ),
    db
      .select({ id: programs.id, title: programs.title })
      .from(programItems)
      .innerJoin(programs, eq(programs.id, programItems.programId))
      .where(
        and(
          eq(programItems.trackId, row.id),
          eq(programs.visibility, "published"),
        ),
      ),
  ]);
  const collections: FilePageCollection[] = [];
  const seenSeries = new Set<string>();
  for (const s of seriesRows) {
    if (seenSeries.has(s.id)) continue;
    seenSeries.add(s.id);
    collections.push({
      kind: "series",
      id: s.id,
      title: s.title,
      href: `/library/series/${s.id}`,
    });
  }
  const seenProgram = new Set<string>();
  for (const p of programRows) {
    if (seenProgram.has(p.id)) continue;
    seenProgram.add(p.id);
    collections.push({
      kind: "training",
      id: p.id,
      title: p.title,
      href: "/programs",
    });
  }

  // "After this" rail — next-in-series (by sort) first, then shared-tag cuts.
  const seriesIds = [...seenSeries];
  const nextInSeries: string[] = [];
  if (seriesIds.length > 0) {
    const items = await db
      .select({
        playlistId: playlistItems.playlistId,
        trackId: playlistItems.trackId,
        sort: playlistItems.sort,
        visibility: tracks.visibility,
      })
      .from(playlistItems)
      .innerJoin(tracks, eq(tracks.id, playlistItems.trackId))
      .where(inArray(playlistItems.playlistId, seriesIds));
    for (const pid of seriesIds) {
      const group = items
        .filter((i) => i.playlistId === pid)
        .sort((a, b) => a.sort - b.sort);
      const selfIdx = group.findIndex((i) => i.trackId === row.id);
      if (selfIdx < 0) continue;
      for (const it of group.slice(selfIdx + 1)) {
        if (it.visibility === "published" && it.trackId !== row.id) {
          nextInSeries.push(it.trackId);
        }
      }
    }
  }
  const nextInSeriesIds = [...new Set(nextInSeries)].slice(0, RAIL_NEXT_LIMIT);

  const myTagIds = tagRows.map((t) => t.id);
  const excluded = new Set<string>([row.id, ...nextInSeriesIds]);
  let sharedTagIds: string[] = [];
  if (myTagIds.length > 0) {
    const sharedRows = await db
      .select({ trackId: trackTags.trackId, n: sql<number>`count(*)::int` })
      .from(trackTags)
      .innerJoin(tracks, eq(tracks.id, trackTags.trackId))
      .where(
        and(
          inArray(trackTags.tagId, myTagIds),
          eq(tracks.visibility, "published"),
        ),
      )
      .groupBy(trackTags.trackId)
      .orderBy(desc(sql`count(*)`))
      .limit(24);
    sharedTagIds = sharedRows
      .map((r) => r.trackId)
      .filter((id) => !excluded.has(id))
      .slice(0, RAIL_SHARED_LIMIT);
  }

  const railIds = [...nextInSeriesIds, ...sharedTagIds];
  let afterThis: LibraryTrack[] = [];
  if (railIds.length > 0) {
    const railRows = await db
      .select()
      .from(tracks)
      .where(inArray(tracks.id, railIds));
    const annotated = await annotateTracks(railRows, {
      userId: viewer.userId,
      accessLevel: viewer.accessLevel,
      granted,
    });
    const byId = new Map(annotated.map((t) => [t.id, t]));
    afterThis = railIds
      .map((id) => byId.get(id))
      .filter((t): t is LibraryTrack => !!t);
  }

  return {
    track,
    isDraftPreview,
    publishedAt: row.publishedAt,
    artworkUrl: await signArtworkUrl(row.artworkKey),
    tagGroups,
    triggers: triggersList,
    collections,
    afterThis,
  };
}
