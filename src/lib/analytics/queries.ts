import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { PATH_FILE, PATH_GATE, type DayPoint, type DeviceBucket } from "./core";

/**
 * Every number on the Sanctum analytics dashboard (A21). GODDESS-ONLY — the page
 * that calls these is `requireGoddess()`-gated and nothing here is ever exposed
 * to a subject (D7).
 *
 * Everything aggregates IN SQL against indexed columns. No query here loads rows
 * into JavaScript to count them; the largest result set any of these returns is
 * a top-10 list.
 *
 * `since` is the start of the selected range, or null for all time. It is bound
 * as a parameter — never interpolated — and every predicate string in this file
 * is a literal written here, not built from anything a caller sent.
 */

async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute<Record<string, unknown>>(query)) as unknown as T[];
}

async function one<T>(query: SQL): Promise<T | null> {
  const r = await rows<T>(query);
  return r[0] ?? null;
}

/**
 * `col >= since`, or an always-true fragment for "all time".
 *
 * The bound value is an ISO string cast in SQL, not a JS `Date`: these run
 * through `db.execute`, whose driver path does not serialize Date objects the
 * way the query builder does (it throws). The cast keeps the comparison
 * unambiguously timestamptz.
 */
const from = (col: SQL, since: Date | null): SQL =>
  since ? sql`${col} >= ${since.toISOString()}::timestamptz` : sql`true`;

const PV = sql`page_views.created_at`;

// ── 1 · Traffic ───────────────────────────────────────────────────────────

export interface TrafficTotals {
  visits: number;
  visitors: number;
  signedInVisits: number;
  anonVisits: number;
  signedInVisitors: number;
  anonVisitors: number;
  /** Median of (dwell summed per visitor per day). Null when nothing measured. */
  medianSessionMs: number | null;
  /** How many views carry a dwell at all — the honesty check on the median. */
  dwellSamples: number;
}

export async function trafficTotals(since: Date | null): Promise<TrafficTotals> {
  const r = await one<{
    visits: number;
    visitors: number;
    signed_in_visits: number;
    anon_visits: number;
    signed_in_visitors: number;
    anon_visitors: number;
    median_session_ms: number | null;
    dwell_samples: number;
  }>(sql`
    WITH v AS (
      SELECT visitor_id, is_signed_in, dwell_ms, created_at
      FROM page_views WHERE ${from(PV, since)}
    ),
    per_visit AS (
      SELECT visitor_id, (created_at AT TIME ZONE 'UTC')::date AS d,
             sum(coalesce(dwell_ms, 0)) AS ms
      FROM v GROUP BY 1, 2 HAVING sum(coalesce(dwell_ms, 0)) > 0
    )
    SELECT
      (SELECT count(*) FROM v)::int AS visits,
      (SELECT count(DISTINCT visitor_id) FROM v)::int AS visitors,
      (SELECT count(*) FILTER (WHERE is_signed_in) FROM v)::int AS signed_in_visits,
      (SELECT count(*) FILTER (WHERE NOT is_signed_in) FROM v)::int AS anon_visits,
      (SELECT count(DISTINCT visitor_id) FILTER (WHERE is_signed_in) FROM v)::int
        AS signed_in_visitors,
      (SELECT count(DISTINCT visitor_id) FILTER (WHERE NOT is_signed_in) FROM v)::int
        AS anon_visitors,
      (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms))::int
         FROM per_visit) AS median_session_ms,
      (SELECT count(*) FILTER (WHERE dwell_ms IS NOT NULL) FROM v)::int AS dwell_samples
  `);
  return {
    visits: r?.visits ?? 0,
    visitors: r?.visitors ?? 0,
    signedInVisits: r?.signed_in_visits ?? 0,
    anonVisits: r?.anon_visits ?? 0,
    signedInVisitors: r?.signed_in_visitors ?? 0,
    anonVisitors: r?.anon_visitors ?? 0,
    medianSessionMs: r?.median_session_ms ?? null,
    dwellSamples: r?.dwell_samples ?? 0,
  };
}

/** Per-day visits + unique visitors (UTC days), sparse — pad with `fillDays`. */
export async function trafficByDay(since: Date | null): Promise<DayPoint[]> {
  const r = await rows<{ day: string; visits: number; visitors: number }>(sql`
    SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
           count(*)::int AS visits,
           count(DISTINCT visitor_id)::int AS visitors
    FROM page_views
    WHERE ${from(PV, since)}
    GROUP BY 1
    ORDER BY 1
    LIMIT 400
  `);
  return r.map((x) => ({
    day: x.day,
    visits: Number(x.visits),
    visitors: Number(x.visitors),
  }));
}

export interface PageRow {
  path: string;
  views: number;
  visitors: number;
  avgDwellMs: number | null;
}

export async function topPages(since: Date | null): Promise<PageRow[]> {
  const r = await rows<{
    path: string;
    views: number;
    visitors: number;
    avg_dwell_ms: number | null;
  }>(sql`
    SELECT path,
           count(*)::int AS views,
           count(DISTINCT visitor_id)::int AS visitors,
           round(avg(dwell_ms) FILTER (WHERE dwell_ms IS NOT NULL))::int AS avg_dwell_ms
    FROM page_views
    WHERE ${from(PV, since)}
    GROUP BY path
    ORDER BY views DESC
    LIMIT 10
  `);
  return r.map((x) => ({
    path: x.path,
    views: Number(x.views),
    visitors: Number(x.visitors),
    avgDwellMs: x.avg_dwell_ms == null ? null : Number(x.avg_dwell_ms),
  }));
}

export interface ReferrerRow {
  host: string;
  views: number;
  visitors: number;
}

export async function topReferrers(since: Date | null): Promise<ReferrerRow[]> {
  const r = await rows<{ host: string; views: number; visitors: number }>(sql`
    SELECT referrer_host AS host,
           count(*)::int AS views,
           count(DISTINCT visitor_id)::int AS visitors
    FROM page_views
    WHERE referrer_host IS NOT NULL AND ${from(PV, since)}
    GROUP BY 1
    ORDER BY views DESC
    LIMIT 8
  `);
  return r.map((x) => ({
    host: x.host,
    views: Number(x.views),
    visitors: Number(x.visitors),
  }));
}

export interface DeviceRow {
  device: DeviceBucket;
  visitors: number;
  views: number;
}

export async function deviceSplit(since: Date | null): Promise<DeviceRow[]> {
  const r = await rows<{ device: DeviceBucket; visitors: number; views: number }>(sql`
    SELECT device::text AS device,
           count(DISTINCT visitor_id)::int AS visitors,
           count(*)::int AS views
    FROM page_views
    WHERE ${from(PV, since)}
    GROUP BY 1
    ORDER BY views DESC
  `);
  return r.map((x) => ({
    device: x.device,
    visitors: Number(x.visitors),
    views: Number(x.views),
  }));
}

// ── 2 · The funnel ────────────────────────────────────────────────────────

export interface Funnel {
  /** Unique visitors in range. */
  visitors: number;
  /** Visitors who opened a file page (`/library/track/[slug]`). */
  reachedFile: number;
  /**
   * Sample plays we can actually see: SIGNED-IN listens of a free-sample track.
   * An anonymous sample play leaves no record anywhere — `PlayerRoot` skips
   * every listen endpoint when logged out (R9.8) — so this is not the whole
   * number, and the dashboard says so instead of guessing.
   */
  samplePlays: number;
  samplePlayers: number;
  /** Visitors who reached `/signin`. */
  reachedGate: number;
  /** Accounts created inside the range. */
  signedUp: number;
  /** Subjects entitled to level ≥ 1 right now (not range-scoped — it is a state). */
  entitledNow: number;
}

export async function funnel(since: Date | null): Promise<Funnel> {
  const [visits, samples, joined, entitled] = await Promise.all([
    one<{ visitors: number; reached_file: number; reached_gate: number }>(sql`
      SELECT
        count(DISTINCT visitor_id)::int AS visitors,
        count(DISTINCT visitor_id) FILTER (WHERE path = ${PATH_FILE})::int
          AS reached_file,
        count(DISTINCT visitor_id) FILTER (WHERE path = ${PATH_GATE})::int
          AS reached_gate
      FROM page_views WHERE ${from(PV, since)}
    `),
    one<{ plays: number; players: number }>(sql`
      SELECT count(*)::int AS plays, count(DISTINCT ls.user_id)::int AS players
      FROM listen_sessions ls
      JOIN tracks t ON t.id = ls.track_id
      WHERE t.free_sample AND ${from(sql`ls.started_at`, since)}
    `),
    one<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM users
      WHERE role = 'subject' AND ${from(sql`users.created_at`, since)}
    `),
    one<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM (
        SELECT user_id FROM entitlements
        WHERE status <> 'frozen' AND access_level >= 1
        GROUP BY user_id
      ) s
    `),
  ]);
  return {
    visitors: visits?.visitors ?? 0,
    reachedFile: visits?.reached_file ?? 0,
    samplePlays: samples?.plays ?? 0,
    samplePlayers: samples?.players ?? 0,
    reachedGate: visits?.reached_gate ?? 0,
    signedUp: joined?.n ?? 0,
    entitledNow: entitled?.n ?? 0,
  };
}

// ── 3 · Listening ─────────────────────────────────────────────────────────

export interface ListeningTotals {
  plays: number;
  listeners: number;
  completed: number;
  seconds: number;
}

export async function listeningTotals(
  since: Date | null,
): Promise<ListeningTotals> {
  const r = await one<{
    plays: number;
    listeners: number;
    completed: number;
    seconds: number;
  }>(sql`
    SELECT count(*)::int AS plays,
           count(DISTINCT user_id)::int AS listeners,
           count(*) FILTER (WHERE completed)::int AS completed,
           coalesce(sum(seconds_listened), 0)::bigint AS seconds
    FROM listen_sessions
    WHERE ${from(sql`listen_sessions.started_at`, since)}
  `);
  return {
    plays: Number(r?.plays ?? 0),
    listeners: Number(r?.listeners ?? 0),
    completed: Number(r?.completed ?? 0),
    seconds: Number(r?.seconds ?? 0),
  };
}

export interface TrackRow {
  /** Carried so the dashboard row opens the track's dossier (no dead numbers). */
  id: string;
  title: string;
  plays: number;
  listeners: number;
  completed: number;
}

export async function topTracks(since: Date | null): Promise<TrackRow[]> {
  const r = await rows<{
    id: string;
    title: string;
    plays: number;
    listeners: number;
    completed: number;
  }>(sql`
    SELECT t.id,
           t.title,
           count(ls.id)::int AS plays,
           count(DISTINCT ls.user_id)::int AS listeners,
           count(ls.id) FILTER (WHERE ls.completed)::int AS completed
    FROM listen_sessions ls
    JOIN tracks t ON t.id = ls.track_id
    WHERE ${from(sql`ls.started_at`, since)}
    GROUP BY t.id, t.title
    ORDER BY plays DESC
    LIMIT 10
  `);
  return r.map((x) => ({
    id: x.id,
    title: x.title,
    plays: Number(x.plays),
    listeners: Number(x.listeners),
    completed: Number(x.completed),
  }));
}

export interface DropRow {
  /** Carried so the row opens the file she needs to look at. */
  id: string;
  title: string;
  reports: number;
  avgDepth: number | null;
  /** Where they typically stopped, seconds into the track. */
  avgStopS: number | null;
  durationS: number | null;
  /** That stop as a share of the track, when the duration is known. */
  stopPct: number | null;
}

/**
 * Drop-off (`drop_reports`). These have been collected since M1 and shown
 * nowhere — this is the first surface that reads them. A report is written when
 * a listener falls out of a session, and the listen session it belongs to
 * carries the position they had reached, which is the actual drop POINT.
 */
export async function dropOff(since: Date | null): Promise<DropRow[]> {
  const r = await rows<{
    id: string;
    title: string;
    reports: number;
    avg_depth: number | null;
    avg_stop_s: number | null;
    duration_s: number | null;
  }>(sql`
    SELECT t.id,
           t.title,
           count(dr.id)::int AS reports,
           round(avg(dr.depth), 1) AS avg_depth,
           round(avg(ls.max_position_s))::int AS avg_stop_s,
           t.duration_s
    FROM drop_reports dr
    JOIN tracks t ON t.id = dr.track_id
    LEFT JOIN listen_sessions ls ON ls.id = dr.listen_session_id
    WHERE ${from(sql`dr.created_at`, since)}
    GROUP BY t.id, t.title, t.duration_s
    ORDER BY reports DESC, avg_stop_s ASC NULLS LAST
    LIMIT 8
  `);
  return r.map((x) => {
    const stop = x.avg_stop_s == null ? null : Number(x.avg_stop_s);
    const dur = x.duration_s == null ? null : Number(x.duration_s);
    return {
      id: x.id,
      title: x.title,
      reports: Number(x.reports),
      avgDepth: x.avg_depth == null ? null : Number(x.avg_depth),
      avgStopS: stop,
      durationS: dur,
      stopPct:
        stop != null && dur != null && dur > 0
          ? Math.min(100, Math.round((stop / dur) * 100))
          : null,
    };
  });
}

// ── 4 · Her people ────────────────────────────────────────────────────────

export interface People {
  subjects: number;
  newSubjects: number;
  linked: number;
  newLinked: number;
  pushUsers: number;
  discreetUsers: number;
  installedUsers: number;
  activeChains: number;
  collared: number;
  frozen: number;
  lapsed: number;
}

export async function people(since: Date | null): Promise<People> {
  const r = await one<Record<keyof People | string, number>>(sql`
    SELECT
      (SELECT count(*) FROM users WHERE role = 'subject')::int AS subjects,
      (SELECT count(*) FROM users
        WHERE role = 'subject' AND ${from(sql`users.created_at`, since)})::int
        AS new_subjects,
      (SELECT count(*) FROM patreon_links)::int AS linked,
      (SELECT count(*) FROM patreon_links
        WHERE ${from(sql`patreon_links.created_at`, since)})::int AS new_linked,
      (SELECT count(DISTINCT user_id) FROM devices
        WHERE push_enabled AND push_subscription IS NOT NULL)::int AS push_users,
      (SELECT count(DISTINCT d.user_id) FROM devices d
        JOIN users u ON u.id = d.user_id
        WHERE d.push_enabled AND d.push_subscription IS NOT NULL
          AND u.disguise_mode)::int AS discreet_users,
      (SELECT count(DISTINCT user_id) FROM devices WHERE installed)::int
        AS installed_users,
      (SELECT count(*) FROM chains
        WHERE current_len > 0 AND last_kept_date >= current_date - 1)::int
        AS active_chains,
      (SELECT count(*) FROM users WHERE oath_at IS NOT NULL)::int AS collared,
      (SELECT count(DISTINCT user_id) FROM entitlements WHERE status = 'frozen')::int
        AS frozen,
      (SELECT count(*) FROM users u
        WHERE u.role = 'subject' AND NOT EXISTS (
          SELECT 1 FROM entitlements e
          WHERE e.user_id = u.id AND e.status <> 'frozen' AND e.access_level >= 1
        ))::int AS lapsed
  `);
  return {
    subjects: Number(r?.subjects ?? 0),
    newSubjects: Number(r?.new_subjects ?? 0),
    linked: Number(r?.linked ?? 0),
    newLinked: Number(r?.new_linked ?? 0),
    pushUsers: Number(r?.push_users ?? 0),
    discreetUsers: Number(r?.discreet_users ?? 0),
    installedUsers: Number(r?.installed_users ?? 0),
    activeChains: Number(r?.active_chains ?? 0),
    collared: Number(r?.collared ?? 0),
    frozen: Number(r?.frozen ?? 0),
    lapsed: Number(r?.lapsed ?? 0),
  };
}

export interface LevelRow {
  level: number;
  label: string | null;
  n: number;
}

/** How many subjects sit at each effective level, with her tier label if one maps. */
export async function levelBreakdown(): Promise<LevelRow[]> {
  const r = await rows<{ level: number; n: number; label: string | null }>(sql`
    WITH lvl AS (
      SELECT user_id, max(access_level) AS l
      FROM entitlements WHERE status <> 'frozen' GROUP BY user_id
    ),
    agg AS (SELECT l, count(*)::int AS n FROM lvl GROUP BY l)
    SELECT agg.l AS level, agg.n,
           (SELECT tm.label FROM tier_mappings tm
             WHERE tm.access_level = agg.l ORDER BY tm.sort LIMIT 1) AS label
    FROM agg
    ORDER BY agg.l DESC
  `);
  return r.map((x) => ({
    level: Number(x.level),
    n: Number(x.n),
    label: x.label ?? null,
  }));
}

// ── 5 · Requests ──────────────────────────────────────────────────────────

export interface Requests {
  commissions: number;
  fromMembers: number;
  fromGuests: number;
  wishes: number;
  petitions: number;
  answered: number;
  collarPetitions: number;
  loves: number;
  comments: number;
}

export async function requests(since: Date | null): Promise<Requests> {
  const r = await one<Record<string, number>>(sql`
    SELECT
      (SELECT count(*) FROM commissions
        WHERE ${from(sql`commissions.created_at`, since)})::int AS commissions,
      (SELECT count(*) FROM commissions
        WHERE user_id IS NOT NULL
          AND ${from(sql`commissions.created_at`, since)})::int AS from_members,
      (SELECT count(*) FROM commissions
        WHERE user_id IS NULL
          AND ${from(sql`commissions.created_at`, since)})::int AS from_guests,
      (SELECT count(*) FROM wishes
        WHERE ${from(sql`wishes.created_at`, since)})::int AS wishes,
      (SELECT count(*) FROM wishes
        WHERE title IS NOT NULL
          AND ${from(sql`wishes.created_at`, since)})::int AS petitions,
      (SELECT count(*) FROM wishes
        WHERE reply IS NOT NULL
          AND ${from(sql`wishes.created_at`, since)})::int AS answered,
      (SELECT count(*) FROM users
        WHERE oath_petitioned_at IS NOT NULL AND oath_at IS NULL)::int
        AS collar_petitions,
      (SELECT count(*) FROM whisper_loves
        WHERE ${from(sql`whisper_loves.created_at`, since)})::int AS loves,
      (SELECT count(*) FROM whisper_comments
        WHERE ${from(sql`whisper_comments.created_at`, since)})::int AS comments
  `);
  return {
    commissions: Number(r?.commissions ?? 0),
    fromMembers: Number(r?.from_members ?? 0),
    fromGuests: Number(r?.from_guests ?? 0),
    wishes: Number(r?.wishes ?? 0),
    petitions: Number(r?.petitions ?? 0),
    answered: Number(r?.answered ?? 0),
    collarPetitions: Number(r?.collar_petitions ?? 0),
    loves: Number(r?.loves ?? 0),
    comments: Number(r?.comments ?? 0),
  };
}

export interface TallyRow {
  key: string;
  n: number;
}

/** Commissions in range grouped by workflow status. */
export async function commissionsByStatus(
  since: Date | null,
): Promise<TallyRow[]> {
  const r = await rows<{ key: string; n: number }>(sql`
    SELECT status::text AS key, count(*)::int AS n
    FROM commissions
    WHERE ${from(sql`commissions.created_at`, since)}
    GROUP BY 1 ORDER BY n DESC
  `);
  return r.map((x) => ({ key: x.key, n: Number(x.n) }));
}

/** Commissions in range grouped by production stage. */
export async function commissionsByStage(since: Date | null): Promise<TallyRow[]> {
  const r = await rows<{ key: string; n: number }>(sql`
    SELECT stage::text AS key, count(*)::int AS n
    FROM commissions
    WHERE ${from(sql`commissions.created_at`, since)}
    GROUP BY 1 ORDER BY n DESC
  `);
  return r.map((x) => ({ key: x.key, n: Number(x.n) }));
}
