/**
 * Anti-abuse for `POST /api/track` (A21).
 *
 * This endpoint is a PUBLIC, unauthenticated write, so it gets the same
 * treatment the anonymous commission intake got (S-10): dependency-free,
 * in-process, deliberately small — and it must never be able to write unbounded
 * rows.
 *
 * Two buckets, both checked:
 *  1. PER VISITOR — `MAX_PER_VISITOR` events per `WINDOW_MS`. A real browser
 *     fires one insert per route change plus one dwell update; 60 a minute is
 *     far above any honest session and far below anything that costs the disk.
 *  2. PER IP — `MAX_PER_IP` events per `WINDOW_MS`. The visitor bucket alone is
 *     bypassed by simply dropping the cookie, so the IP bucket is the ceiling
 *     that a cookie-rotating flooder still hits. It only means anything because
 *     `clientIp` now reads Cloudflare's own header rather than the caller's
 *     X-Forwarded-For; while it trusted the latter, a spoofed header bought a
 *     fresh bucket every request and this cap did nothing.
 *
 * LIMITATION, stated as plainly as `src/lib/commissions/throttle.ts` states its
 * own: this is a Map in ONE process. A second web container, or a restart,
 * starts from zero, and a caller who rotates IP addresses is not stopped. It
 * raises the cost of casual flooding; it is not a rate limiter, and it does not
 * close S-10.
 */

/** Events one visitor cookie may spend per window. */
export const MAX_PER_VISITOR = 60;
/** Events one IP may spend per window, across every cookie it presents. */
export const MAX_PER_IP = 120;
/** The rolling window for both caps. */
export const WINDOW_MS = 60_000;

/** Hard ceiling on tracked keys per bucket, so a flood cannot grow the maps. */
const MAX_TRACKED = 20_000;

export type TrackVerdict = "ok" | "throttled";

const byVisitor = new Map<string, number[]>();
const byIp = new Map<string, number[]>();

/** Drop everything outside the window, then trim to the ceiling (Map preserves
 *  insertion order, so the head is the coldest key). */
function prune(map: Map<string, number[]>, now: number): void {
  for (const [key, stamps] of map) {
    const live = stamps.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) map.delete(key);
    else map.set(key, live);
  }
  while (map.size > MAX_TRACKED) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function spend(map: Map<string, number[]>, key: string, max: number, now: number) {
  const stamps = map.get(key) ?? [];
  if (stamps.length >= max) return false;
  map.set(key, [...stamps, now]);
  return true;
}

/**
 * Decide, and record on acceptance. `now` is injectable so the window behaviour
 * is testable without waiting a minute.
 */
export function guardTrackEvent(
  visitorId: string,
  ip: string,
  now: number = Date.now(),
): TrackVerdict {
  prune(byVisitor, now);
  prune(byIp, now);
  // The IP bucket is spent first: a caller who is already over the IP ceiling
  // must not be able to burn a fresh visitor bucket on every request.
  if (!spend(byIp, ip, MAX_PER_IP, now)) return "throttled";
  if (!spend(byVisitor, visitorId, MAX_PER_VISITOR, now)) return "throttled";
  return "ok";
}

/** Test-only: forget everything. Never called by the app. */
export function resetTrackThrottle(): void {
  byVisitor.clear();
  byIp.clear();
}
