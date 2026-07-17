"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `cb` every `delayMs`, pausing while the tab is hidden and firing once
 * immediately when it becomes visible again (ROADMAP-v1.5 C1.4). Pass a shorter
 * delay while work is in flight and a longer one when idle — changing `delayMs`
 * restarts the interval.
 *
 * Shared across the Sanctum reactive surfaces (library, dossier, the live room)
 * and the subject in-session touch overlay (R9.1).
 */
export function usePolling(cb: () => void, delayMs: number): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (!document.hidden) cbRef.current();
      }, delayMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    start();
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        cbRef.current();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [delayMs]);
}
