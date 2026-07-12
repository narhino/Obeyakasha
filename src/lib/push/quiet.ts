/**
 * Quiet hours (PLAN §12) — PURE, unit-tested. A subject's quiet window is
 * [startHour, endHour) in THEIR timezone and may wrap midnight (e.g. 22→9).
 * Non-override notifications are held back while a subject is inside it.
 */
export function localHour(nowUtc: Date, timezone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const part = fmt.formatToParts(nowUtc).find((p) => p.type === "hour");
    if (!part) return null;
    return parseInt(part.value, 10) % 24;
  } catch {
    return null; // invalid timezone → caller treats as "not quiet"
  }
}

export function isWithinQuietHours(
  nowUtc: Date,
  timezone: string,
  startHour: number,
  endHour: number,
): boolean {
  const h = localHour(nowUtc, timezone);
  if (h === null) return false;
  if (startHour === endHour) return false; // empty window
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour; // wraps midnight
}
