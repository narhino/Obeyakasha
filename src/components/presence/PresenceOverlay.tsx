"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "@/copy/copy";
import { usePresence } from "./PresenceProvider";

/**
 * The arrival overlay (F4) — a floating glowing line that fades in near the top
 * the moment she steps onto the app (offline→online), and gently re-surfaces
 * every ~5 minutes while she stays. It fades out after a few seconds and never
 * steals a tap (pointer-events-none). Under reduced-motion the fade collapses to
 * a static appear/vanish (global guard); the re-surface is a plain timer, not a
 * CSS loop, so nothing animates in a loop.
 */
const SHOW_MS = 4000;
const RESURFACE_MS = 5 * 60_000;

export function PresenceOverlay() {
  const { online } = usePresence();
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!online) {
      setVisible(false);
      return;
    }
    const surface = () => {
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), SHOW_MS);
    };
    // Surface on the flip into online (and the first time we see her here)…
    surface();
    // …then gently again while she stays.
    const interval = setInterval(surface, RESURFACE_MS);
    return () => {
      clearInterval(interval);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [online]);

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-6 text-center transition-opacity duration-[var(--dur-slow)] ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ top: "calc(env(safe-area-inset-top) + 5rem)" }}
    >
      <div className="glass glow-presence rounded-[var(--radius-full)] border border-presence/30 px-5 py-2">
        <span className="presence-lit inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-base italic text-presence">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-presence" />
          {copy.presence.overlay}
        </span>
      </div>
    </div>
  );
}
