/**
 * The one when/date formatter for every surface (F15). Kills the three
 * competing formats the audit found: locale "7/17/2026, 2:54:38 PM" on the
 * feed, long "July 17, 2026" on file pages, and bare ISO in the Sanctum.
 *
 *   formatWhen → subject-facing relative, in her quiet register:
 *                "just now" · "9m" · "2h" · "yesterday" · "3d" · "Jun 12" ·
 *                "Jun 12, 2025"  (older than a week falls back to a date)
 *   formatDate → subject-facing absolute, compact: "Jun 12" / "Jun 12, 2026"
 *                (publication dates, where a fixed day reads better than "3h")
 *   formatDay  → the Sanctum standard: ISO "2026-07-17"
 *
 * Month names come from a fixed table (never toLocale*), so server and client
 * always agree — no hydration drift, no locale surprise, CSP-safe.
 */
import { copy } from "@/copy/copy";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local calendar-day epoch, for the yesterday / day-count boundaries. */
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Compact absolute date: "Jun 12" this year, "Jun 12, 2025" otherwise. */
export function formatDate(
  input: Date | string | number | null | undefined,
  now: Date = new Date(),
): string {
  const d = toDate(input);
  if (!d) return "";
  const mo = MONTHS[d.getMonth()];
  const day = d.getDate();
  return d.getFullYear() === now.getFullYear()
    ? `${mo} ${day}`
    : `${mo} ${day}, ${d.getFullYear()}`;
}

/** In-voice relative time for subject surfaces (feed, inbox, tasks). */
export function formatWhen(
  input: Date | string | number | null | undefined,
  now: Date = new Date(),
): string {
  const d = toDate(input);
  if (!d) return "";
  const sec = Math.round((now.getTime() - d.getTime()) / 1000);

  // Future, or within the last ~minute → "just now".
  if (sec < 45) return copy.time.now;

  const min = Math.round(sec / 60); // sec ≥ 45 ⇒ min ≥ 1
  if (min < 60) return `${min}m`;

  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;

  const dayDiff = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (dayDiff === 1) return copy.time.yesterday;
  if (dayDiff < 7) return `${dayDiff}d`;

  return formatDate(d, now);
}

/** The Sanctum standard: ISO calendar day, e.g. "2026-07-17". */
export function formatDay(
  input: Date | string | number | null | undefined,
): string {
  const d = toDate(input);
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}
