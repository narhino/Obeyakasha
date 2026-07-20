/**
 * F4 presence — the pure time math behind "the Goddess is on the app" and the
 * heartbeat throttle. No DB, no I/O: everything here is a function of a stored
 * `lastSeenAt` and the current instant, so it reasons the same on server and
 * client and is trivially testable.
 *
 * D7: nothing here ever touches another subject. The goddess-online check reads
 * exactly one timestamp — hers — and two settings; a subject never learns a
 * time, only a boolean.
 */

/** How fresh the goddess's heartbeat must be to read as "here". */
export const PRESENCE_WINDOW_MS = 2 * 60_000;

/** Server-side heartbeat throttle: skip the write if the last one is this recent. */
export const HEARTBEAT_THROTTLE_MS = 30_000;

/** Is `lastSeenAt` inside the window at `now`? A future stamp (clock skew across
 *  machines) counts as present rather than being discarded. */
export function isPresent(
  lastSeenAt: Date | null | undefined,
  now: Date = new Date(),
  windowMs: number = PRESENCE_WINDOW_MS,
): boolean {
  if (!lastSeenAt) return false;
  const delta = now.getTime() - lastSeenAt.getTime();
  if (delta < 0) return true; // future stamp — clock skew, treat as present
  return delta <= windowMs;
}

/**
 * The one rule a subject's "She is here" band obeys: she reads online only when
 * presence is enabled, she is NOT cloaked, and her heartbeat is fresh. Cloak and
 * the master switch each veto independently of the timestamp.
 */
export function isGoddessOnline(
  lastSeenAt: Date | null | undefined,
  opts: { presenceEnabled: boolean; cloaked: boolean },
  now: Date = new Date(),
  windowMs: number = PRESENCE_WINDOW_MS,
): boolean {
  if (!opts.presenceEnabled) return false;
  if (opts.cloaked) return false;
  return isPresent(lastSeenAt, now, windowMs);
}

/** Should the heartbeat route write, given the caller's current `lastSeenAt`?
 *  First beat (null) always writes; otherwise only once the throttle has passed. */
export function shouldWriteHeartbeat(
  lastSeenAt: Date | null | undefined,
  now: Date = new Date(),
  throttleMs: number = HEARTBEAT_THROTTLE_MS,
): boolean {
  if (!lastSeenAt) return true;
  return now.getTime() - lastSeenAt.getTime() >= throttleMs;
}
