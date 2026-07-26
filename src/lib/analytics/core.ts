/**
 * First-party analytics — PURE helpers (A21). No DB, no I/O, no `next/*`.
 * This is the file that decides what may ever be written to `page_views`, so it
 * is also the file the privacy promise rests on. Unit-tested in core.test.ts.
 */

export type DeviceBucket = "mobile" | "tablet" | "desktop";
export type RangeKey = "7d" | "30d" | "90d" | "all";

/** Longest normalized path we will store. The allowlist is far shorter; this is
 *  a belt on top of the braces. */
export const PATH_MAX = 64;
/** Longest referrer host we will store. */
export const HOST_MAX = 100;
/** Ceiling on a single view's dwell (6h). Anything longer is a stuck tab. */
export const DWELL_MAX_MS = 6 * 60 * 60 * 1_000;

// ── Path normalization ────────────────────────────────────────────────────
//
// An ALLOWLIST, not a sanitiser. Anything the list does not recognise collapses
// to its first segment (or `/other`), so no id, slug, token or typed string can
// reach the table by inventing a URL. Dynamic segments become their route
// pattern — `/library/track/[slug]` — which is also what makes "top pages"
// aggregate into something she can read.

/** Static routes stored exactly as they are. */
const EXACT = new Set([
  "/",
  "/about",
  "/asks",
  "/commissions",
  "/inbox",
  "/library",
  "/me",
  "/messages",
  "/orders",
  "/privacy",
  "/programs",
  "/settings",
  "/signin",
  "/styleguide",
  "/terms",
  "/threshold",
  "/whispers",
]);

/**
 * The two patterns the funnel counts on. Exported so the dashboard's SQL binds
 * the same literal this file produces — the funnel silently reading zero because
 * a pattern was renamed here is exactly the drift worth designing out.
 */
export const PATH_FILE = "/library/track/[slug]";
export const PATH_GATE = "/signin";

/** `[prefix, stored pattern]` — a path under `prefix/` collapses to the pattern. */
const PATTERNS: [string, string][] = [
  // The Sanctum is one collapsed marker: her own movements are not a funnel,
  // and its URLs carry subject and track ids.
  ["/sanctum", "/sanctum"],
  ["/library/track", PATH_FILE],
  ["/library/series", "/library/series/[id]"],
  ["/messages", "/messages/[id]"],
  ["/programs", "/programs/[id]"],
];

/** Paths never recorded at all: the API surface and anything file-like. */
function isUntrackable(path: string): boolean {
  if (path.startsWith("/api/")) return true;
  if (path.startsWith("/_next/")) return true;
  if (path.startsWith("/icons/")) return true;
  if (path.startsWith("/art/")) return true;
  if (path === "/sw.js" || path === "/manifest.webmanifest") return true;
  // Anything with a file extension in its last segment is an asset, not a page.
  const last = path.slice(path.lastIndexOf("/") + 1);
  return /\.[a-z0-9]{1,8}$/i.test(last);
}

/**
 * Normalize a raw pathname into the route pattern we are willing to store.
 * Returns `null` when the path must not be tracked at all.
 *
 * Query strings and fragments are cut before anything else — they are the most
 * likely place for a stray token or email address, and they are never stored.
 */
export function normalizePath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  // Cut query + hash, then decode nothing (a decoded `%2f` must not create a
  // segment that was not in the URL).
  let path = raw.split("?")[0]!.split("#")[0]!;
  if (!path.startsWith("/")) return null;
  // Collapse duplicate slashes and drop a trailing slash (but keep root).
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  if (isUntrackable(path)) return null;
  if (EXACT.has(path)) return path;

  for (const [prefix, pattern] of PATTERNS) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return pattern;
  }

  // Unknown route. Keep only the first segment — always a static route name in
  // this app (there is no root-level catch-all) — and mark that more followed.
  const first = path.split("/")[1] ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,23}$/i.test(first)) return "/other";
  const deeper = path.indexOf("/", 1) !== -1;
  const out = deeper ? `/${first.toLowerCase()}/*` : `/${first.toLowerCase()}`;
  return out.slice(0, PATH_MAX);
}

// ── Device bucketing ──────────────────────────────────────────────────────

/**
 * Bucket a user-agent. Deliberately coarse: three values, no version, no OS, no
 * brand — the string itself is never stored, and this is all we would want from
 * it anyway. An absent or unrecognised UA reads as desktop.
 */
export function deviceFromUa(ua: string | null | undefined): DeviceBucket {
  if (!ua) return "desktop";
  const s = ua.toLowerCase();
  // Tablets first: every Android tablet also says "android", and the iPad says
  // "macintosh" in desktop mode (caught by the touch hint below at the client).
  if (
    s.includes("ipad") ||
    s.includes("tablet") ||
    s.includes("kindle") ||
    s.includes("playbook") ||
    s.includes("silk") ||
    (s.includes("android") && !s.includes("mobile"))
  ) {
    return "tablet";
  }
  if (
    s.includes("mobi") ||
    s.includes("iphone") ||
    s.includes("ipod") ||
    s.includes("android") ||
    s.includes("windows phone")
  ) {
    return "mobile";
  }
  return "desktop";
}

// ── Referrer ──────────────────────────────────────────────────────────────

/**
 * Reduce whatever the client sent to a bare host, or null. Accepts a host or a
 * full URL and keeps only the hostname — a full URL must never be stored, so
 * this refuses rather than truncates anything it cannot parse.
 */
export function normalizeReferrerHost(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  // Strip a stray port, credentials, or path if one slipped through.
  host = host.split("/")[0]!.split("@").pop()!.split(":")[0]!;
  if (host.length === 0 || host.length > HOST_MAX) return null;
  // Hostname charset only. Anything else is not a host and is dropped.
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (!host.includes(".")) return null; // localhost / bare labels: not useful
  return host;
}

// ── Ranges & bucketing for the dashboard ──────────────────────────────────

export const RANGES: Record<RangeKey, { label: string; days: number | null }> = {
  "7d": { label: "7 days", days: 7 },
  "30d": { label: "30 days", days: 30 },
  "90d": { label: "90 days", days: 90 },
  all: { label: "All", days: null },
};

/** Parse `?range=` into a known key. Anything unknown falls back to 30d. */
export function parseRange(raw: string | undefined | null): RangeKey {
  return raw === "7d" || raw === "90d" || raw === "all" ? raw : "30d";
}

/** The inclusive start of a range, or null for "all time". */
export function rangeStart(key: RangeKey, now: Date = new Date()): Date | null {
  const days = RANGES[key].days;
  if (days == null) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
}

export interface DayPoint {
  /** `YYYY-MM-DD`. */
  day: string;
  visits: number;
  visitors: number;
}

/** `YYYY-MM-DD` for a date, in UTC (the column is timestamptz; SQL buckets in UTC). */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pad a sparse per-day result into a continuous series ending today, so the bar
 * row shows real gaps as gaps instead of silently compressing them. `days` null
 * (all time) just returns the rows in order.
 */
export function fillDays(
  rows: DayPoint[],
  days: number | null,
  now: Date = new Date(),
): DayPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  if (days == null) {
    return [...rows].sort((a, b) => a.day.localeCompare(b.day));
  }
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1_000);
    const key = isoDay(d);
    out.push(byDay.get(key) ?? { day: key, visits: 0, visitors: 0 });
  }
  return out;
}

/** Percentage of `part` in `whole`, rounded. Null when the base is empty — a
 *  conversion rate out of zero is not 0%, it is unknown. */
export function pct(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/** Bar height as a share of the biggest bar (2–100), so a 1-visit day still shows. */
export function barPct(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

/** Milliseconds → `4m 12s` / `38s` / `1h 04m`. Null in, dash out. */
export function humanMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** Seconds → `mm:ss` (used for drop points inside a track). */
export function clockS(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Clamp a client-reported dwell into something storable. */
export function clampDwell(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(Math.round(ms), DWELL_MAX_MS);
}
