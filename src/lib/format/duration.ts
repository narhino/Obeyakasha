/**
 * The one duration formatter for every subject-facing surface (F13). Kills the
 * old "0 min" floor bug where a 30-second clip read "0 min" on cards while the
 * mini-player showed "0:30". One shape everywhere:
 *
 *   under 10 min  → m:ss      (0:30, 9:45)   — precise where it matters
 *   10–60 min     → "X min"   (12 min, 45 min)
 *   over an hour  → "1h 12m"  (1h, 1h 12m)
 *
 * Returns "" for null/unknown durations so callers can omit the field cleanly.
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (
    totalSeconds == null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds < 0
  ) {
    return "";
  }
  const s = Math.round(totalSeconds);

  // Under ten minutes: a real clock, never floored to "0 min".
  if (s < 600) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * A live playhead clock — always m:ss (h:mm:ss past an hour). Used by the
 * transport (mini-player position, scrub read-outs) where the value ticks and
 * must stay a stable monospaceable time, not a rounded "X min" label.
 */
export function formatClock(totalSeconds: number | null | undefined): string {
  if (
    totalSeconds == null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds < 0
  ) {
    return "0:00";
  }
  const s = Math.floor(totalSeconds);
  const sec = s % 60;
  const totalMinutes = Math.floor(s / 60);
  if (totalMinutes < 60) return `${totalMinutes}:${String(sec).padStart(2, "0")}`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
