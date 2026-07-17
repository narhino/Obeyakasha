"use client";

import { useEffect, useState } from "react";
import { Button, Display, Ornament, Whisper } from "@/components/ui";
import { copy, fill } from "@/copy/copy";

interface Moment {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** The single line she speaks for a moment kind. Unknown kinds render nothing. */
function lineFor(m: Moment): string | null {
  switch (m.kind) {
    case "rank_up":
      return fill(copy.moments.rankUp, { rank: String(m.payload.rank ?? "") });
    case "praised":
      return copy.moments.praised;
    case "collared":
      return copy.moments.collared;
    default:
      return null;
  }
}

/**
 * Ritual moments (R7). On a subject's return, any un-shown moment (rank-up,
 * praise) rises full-screen — one at a time — and is dismissed with a single
 * gold "Kneel". Mounted once in the subject layout. Token-only; the fade honours
 * prefers-reduced-motion because the global CSS neutralises transitions there.
 */
export function Moments() {
  const [queue, setQueue] = useState<Moment[]>([]);
  const [visible, setVisible] = useState(false);
  const current = queue[0];

  // Pull the queue once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/moments");
        if (!res.ok) return;
        const data = (await res.json()) as { moments?: Moment[] };
        const renderable = (data.moments ?? []).filter(
          (m) => lineFor(m) !== null,
        );
        if (!cancelled && renderable.length > 0) setQueue(renderable);
      } catch {
        /* silence — moments are a grace note, never a blocker */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fade each moment in as it reaches the front of the queue.
  useEffect(() => {
    if (!current) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [current]);

  if (!current) return null;
  const line = lineFor(current);
  if (!line) return null;

  function dismiss() {
    const id = current!.id;
    setVisible(false); // fade out
    void fetch("/api/me/moments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    // Advance after the fade so the next moment fades in cleanly.
    window.setTimeout(() => setQueue((q) => q.slice(1)), 280);
  }

  const orderTitle =
    current.kind === "praised" ? String(current.payload.orderTitle ?? "") : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 z-[100] flex items-center justify-center px-6 text-center transition-opacity duration-[var(--dur-slow)] ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-bg/95 backdrop-blur-md"
      />
      <div
        aria-hidden
        className="motion-safe:breathe pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 45%, var(--color-accent-soft) 0%, transparent 72%)",
        }}
      />
      <div className="max-w-sm">
        <p className="mb-8 font-[family-name:var(--font-display)] text-5xl text-gold [text-shadow:0_0_50px_rgba(212,175,106,0.3)]">
          {copy.brand.mark}
        </p>
        <Ornament className="mx-auto w-28" />
        <Display as="h2" className="mt-6 text-[1.9rem] leading-tight">
          {line}
        </Display>
        {orderTitle ? <Whisper className="mt-3">{orderTitle}</Whisper> : null}
        <div className="mt-9 flex justify-center">
          <Button variant="gold" size="lg" onClick={dismiss}>
            {copy.moments.dismiss}
          </Button>
        </div>
      </div>
    </div>
  );
}
