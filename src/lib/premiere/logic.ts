/**
 * Premieres (R9.6) — PURE, unit-tested. A premiere seals a PUBLISHED track from
 * playback until its appointed moment: the catalog and file page still show it
 * (a countdown, anticipation), but the stream endpoint refuses it — even for the
 * entitled, and even when it is a free sample. Sealing is purely a function of
 * `premiereAt` versus now; a null premiereAt never seals.
 */

/**
 * Parse a Sanctum datetime-local input ("YYYY-MM-DDTHH:mm", optionally with
 * seconds) as UTC. Empty / whitespace → null; unparseable → throws. Premiere
 * times are handled in UTC end to end — the input default is a plain slice of
 * the stored ISO — so a value round-trips exactly, with no timezone drift and no
 * SSR/hydration mismatch from computing local time.
 */
export function parsePremiereInput(raw: string | null | undefined): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  // Enforce the datetime-local shape up front — the lenient Date parser would
  // otherwise coerce junk into a surprise date.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:\d{2})?$/.exec(s);
  if (!m) throw new Error("Invalid premiere time");
  const iso = m[6] ? `${s}Z` : `${s}:00Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid premiere time");
  return d;
}

/** Coerce a timestamp that may arrive as a Date, an ISO string, or null. */
function toTime(input: Date | string | null | undefined): number | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Is this track sealed by a still-future premiere? True only when premiereAt is
 * set AND strictly ahead of `now`. Once the moment passes it returns false, and
 * the track plays like any other. This is the single predicate the stream gate,
 * the catalog card, and the file page all read.
 */
export function isPremiereSealed(
  premiereAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const t = toTime(premiereAt);
  if (t === null) return false;
  return t > now.getTime();
}

/**
 * Has a premiere come due and not yet been announced? The worker's appointment
 * push fires when this is true, then stamps premiereAnnouncedAt so it fires
 * exactly once. (The worker's SQL claim is the real guard against overlap; this
 * pure predicate mirrors it for tests and clarity.)
 */
export function premiereDue(
  premiereAt: Date | string | null | undefined,
  announcedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const at = toTime(premiereAt);
  if (at === null) return false;
  if (toTime(announcedAt) !== null) return false;
  return at <= now.getTime();
}
