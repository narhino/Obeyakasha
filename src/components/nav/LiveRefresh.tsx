"use client";

import { useRouter } from "next/navigation";
import { usePolling } from "@/lib/hooks/usePolling";

/**
 * Keeps every subject surface live without a manual reload. On an interval (and
 * the moment the tab is re-shown) it re-runs the current route's server
 * components via `router.refresh()` — so a new whisper appears in the feed, the
 * red burn lights the tab a message/task just landed on, and unread counts move,
 * all on their own. Client state (the player, open sheets) is preserved; the
 * refresh is a soft revalidate, not a page reload.
 *
 * Paused while the tab is hidden (usePolling), so a backgrounded app is quiet.
 */
export function LiveRefresh() {
  const router = useRouter();
  usePolling(() => router.refresh(), 30_000);
  return null;
}
