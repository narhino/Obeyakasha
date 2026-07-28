"use client";

import { usePulse } from "@/lib/hooks/usePulse";

/**
 * Keeps every surface live without a manual reload — a new whisper appears in
 * the feed, the red burn lights the tab a message or task just landed on, and
 * unread counts move, all on their own. Client state (the player, open sheets)
 * is preserved; the refresh is a soft revalidate, not a page reload.
 *
 * It used to re-run the whole route blindly every 30 seconds. Now it watches a
 * tiny change token and refreshes only when something actually moved, so news
 * lands in about five seconds instead of up to thirty — while doing LESS work
 * than the old timer, which paid full price on every tick to usually find
 * nothing. Mounted in both shells: the subject app and the Sanctum, which had
 * no auto-refresh at all and so never updated under her at all.
 */
export function LiveRefresh() {
  usePulse();
  return null;
}
