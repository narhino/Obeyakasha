"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "@/lib/player/store";
import { usePolling } from "@/lib/hooks/usePolling";

interface TouchMoment {
  id: string;
  kind: string;
  payload: { text?: string };
  createdAt: string;
}

const HOLD_MS = 6000;
const FADE_MS = 700;

/**
 * Live touch (R9.1) — her hand on the back of the neck mid-session. While audio
 * is PLAYING this polls the live channel (`/api/me/moments?kinds=touch`, which
 * only ever returns the live-only "touch" kind — never a ritual moment). A new
 * line breathes in over the player, holds ~6s, and fades — quiet, not a popup.
 * `pointer-events-none` means it never steals a tap from the transport, so it
 * floats over both the fullscreen player and the regular views.
 *
 * It is deliberately a different surface from the session-start ritual overlay
 * (`Moments`): touches are excluded from the ritual query server-side, so the
 * two can never collide. Reduced motion collapses the fade to an appear/vanish
 * because the global CSS neutralises transitions there.
 *
 * Mounted once inside PlayerRoot's subject chrome — so it lives exactly where
 * the player does, and never on the Sanctum/auth surfaces.
 */
export function Touch() {
  const playing = usePlayer((s) => s.playing);
  const current = usePlayer((s) => s.current);
  const active = Boolean(playing && current);

  const [queue, setQueue] = useState<TouchMoment[]>([]);
  const [visible, setVisible] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const head = queue[0];

  const poll = useCallback(async () => {
    if (!active) return;
    try {
      const res = await fetch("/api/me/moments?kinds=touch", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { moments?: TouchMoment[] };
      const fresh = (data.moments ?? []).filter(
        (m) => m.payload?.text && !seenIds.current.has(m.id),
      );
      if (fresh.length === 0) return;
      for (const m of fresh) seenIds.current.add(m.id);
      setQueue((q) => [...q, ...fresh]);
    } catch {
      /* silence — a touch that slips is never worth a visible error */
    }
  }, [active]);

  // Recurring poll (reuses the shared polling hook). Plus an immediate read the
  // moment playback begins, so a touch dropped as they settle in lands promptly.
  usePolling(() => void poll(), 12000);
  useEffect(() => {
    if (active) void poll();
  }, [active, poll]);

  // Fade the head of the queue in, hold, fade out, then advance.
  useEffect(() => {
    if (!head) return;
    const id = head.id;
    // Mark shown at once so it never re-surfaces on a reload or the next poll.
    void fetch("/api/me/moments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});

    const raf = requestAnimationFrame(() => setVisible(true));
    const holdT = window.setTimeout(() => setVisible(false), HOLD_MS);
    const nextT = window.setTimeout(
      () => setQueue((q) => q.slice(1)),
      HOLD_MS + FADE_MS,
    );
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(holdT);
      clearTimeout(nextT);
    };
  }, [head]);

  if (!head) return null;
  const line = head.payload.text ?? "";
  if (!line) return null;

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 top-1/2 z-[60] flex -translate-y-1/2 justify-center px-10 text-center transition-opacity duration-[var(--dur-slow)] ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="relative max-w-md">
        <div
          aria-hidden
          className="motion-safe:breathe pointer-events-none absolute inset-0 -z-10 -m-16"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 50%, var(--color-accent-soft) 0%, transparent 70%)",
          }}
        />
        <p className="font-[family-name:var(--font-display)] text-3xl leading-tight text-gold [text-shadow:0_0_40px_rgba(212,175,106,0.35)]">
          {line}
        </p>
      </div>
    </div>
  );
}
