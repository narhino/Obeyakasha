/**
 * Guards for HER alerts. Two jobs:
 *
 *  - `alertOnce(key, windowMs)` — a per-key cooldown so one subject writing
 *    five lines in a row buzzes her once, not five times. In-memory, so it
 *    resets on restart and is per-process (web and worker each hold their own).
 *    That is deliberately acceptable: the failure mode is one extra push, never
 *    a missed one, and a durable table for this would cost a write per event.
 *
 *  - `excerpt(text)` — a short, safe preview for the notification body. A
 *    subject's words reach her lock screen, so it is trimmed, collapsed, and
 *    cut at a sane length rather than pasted whole.
 */

const DEFAULT_WINDOW_MS = 5 * 60_000;
const seen = new Map<string, number>();

/** True when this key hasn't fired inside the window (and claims it if so). */
export function alertOnce(
  key: string,
  windowMs: number = DEFAULT_WINDOW_MS,
  now: number = Date.now(),
): boolean {
  const last = seen.get(key);
  if (last !== undefined && now - last < windowMs) return false;
  seen.set(key, now);
  // Opportunistic sweep — this map only ever holds recent keys.
  if (seen.size > 500) {
    for (const [k, t] of seen) if (now - t > windowMs) seen.delete(k);
  }
  return true;
}

/** Test seam: forget every cooldown. */
export function _resetAlerts(): void {
  seen.clear();
}

/** A one-line preview of someone's words, safe for a notification body. */
export function excerpt(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}
