"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keep a surface live by watching for change rather than assuming it.
 *
 * The old approach re-ran the entire current route every 30 seconds whether or
 * not anything had happened — slow to notice (up to half a minute) and far too
 * expensive to simply run more often. This polls `/api/pulse` instead: a few
 * hundred bytes and one indexed query. A real refresh happens only when the
 * token changes, so updates land in seconds AND the server does less work than
 * it did before.
 *
 * `fallbackMs` is the belt: a plain refresh on a long timer, so anything the
 * pulse doesn't cover still arrives eventually instead of never. The pulse
 * cannot know about everything, and pretending otherwise would just move the
 * staleness somewhere harder to find.
 *
 * Both timers stop while the tab is hidden, and a return to the tab checks
 * immediately — coming back to the app should never show you yesterday.
 */
export function usePulse(pollMs = 5_000, fallbackMs = 120_000): void {
  const router = useRouter();
  const last = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function check() {
      // A slow network must not stack requests on top of each other.
      if (inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v?: string };
        if (cancelled || !v) return;
        // First read only establishes the baseline — refreshing on arrival
        // would double-render every page load for nothing.
        if (last.current === null) {
          last.current = v;
          return;
        }
        if (v !== last.current) {
          last.current = v;
          router.refresh();
        }
      } catch {
        /* offline or a blip: the next tick tries again */
      } finally {
        inFlight.current = false;
      }
    }

    const start = () => {
      if (!pollTimer) pollTimer = setInterval(() => void check(), pollMs);
      if (!fallbackTimer)
        fallbackTimer = setInterval(() => {
          if (!document.hidden) router.refresh();
        }, fallbackMs);
    };
    const stop = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      pollTimer = null;
      fallbackTimer = null;
    };

    void check();
    start();

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void check();
        start();
      }
    };
    // A phone waking from sleep fires focus but not always visibilitychange.
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [router, pollMs, fallbackMs]);
}
