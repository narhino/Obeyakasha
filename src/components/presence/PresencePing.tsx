"use client";

import { useEffect } from "react";
import { usePolling } from "@/lib/hooks/usePolling";

/**
 * The heartbeat (F4). Mounted for every signed-in surface — the subject shell
 * AND the Sanctum — so both a subject's and the goddess's `lastSeenAt` stay
 * fresh. It is her beats that light the "She is here" band for subjects; theirs
 * put them in her "In the room" view.
 *
 * Beats on load, whenever the tab becomes visible again, and every 60s WHILE the
 * tab is visible (never while hidden — usePolling pauses the interval and fires
 * once on re-show). The server throttles the writes. Dependency-free, and it
 * keeps beating even while the threshold takeover is up.
 */
async function beat(): Promise<void> {
  try {
    await fetch("/api/presence", {
      method: "POST",
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    /* a missed beat is never worth a visible error */
  }
}

export function PresencePing() {
  useEffect(() => {
    void beat(); // on load
  }, []);
  usePolling(() => void beat(), 60_000); // every 60s visible + on re-show
  return null;
}
