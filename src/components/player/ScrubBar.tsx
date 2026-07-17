"use client";

import { useRef, useState } from "react";
import { copy } from "@/copy/copy";

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Draggable scrub bar (R4/P1) with time labels and a buffered-range indicator.
 * The UI never touches the audio element — releasing the drag calls `onSeek`,
 * which routes through the store's seek request that PlayerRoot consumes.
 */
export function ScrubBar({
  positionS,
  durationS,
  bufferedS,
  onSeek,
}: {
  positionS: number;
  durationS: number;
  bufferedS: number;
  onSeek: (positionS: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragFrac, setDragFrac] = useState<number | null>(null);

  const dur = durationS > 0 ? durationS : 0;
  const playedFrac = dur > 0 ? Math.min(positionS / dur, 1) : 0;
  const bufferedFrac = dur > 0 ? Math.min(Math.max(bufferedS / dur, 0), 1) : 0;
  const frac = dragFrac ?? playedFrac;
  const shownPos = dur > 0 ? frac * dur : 0;

  function fracFromClientX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (dur <= 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragFrac(fracFromClientX(e.clientX));
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    setDragFrac(fracFromClientX(e.clientX));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const f = fracFromClientX(e.clientX);
    setDragFrac(null);
    if (dur > 0) onSeek(f * dur);
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (dur <= 0) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSeek(Math.max(0, positionS - 5));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onSeek(Math.min(dur, positionS + 5));
    }
  }

  return (
    <div className="w-full select-none">
      {/* Padded hit area keeps the touch target tall while the bar stays thin. */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={copy.player.controls.scrub}
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(shownPos)}
        aria-valuetext={`${fmt(shownPos)} of ${fmt(dur)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="group relative flex h-6 cursor-pointer touch-none items-center"
      >
        <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-line/70">
          {/* buffered ahead */}
          <div
            className="absolute inset-y-0 left-0 bg-text-dim/35"
            style={{ width: `${bufferedFrac * 100}%` }}
          />
          {/* played */}
          <div
            className="absolute inset-y-0 left-0 bg-gold"
            style={{ width: `${frac * 100}%` }}
          />
        </div>
        {/* thumb */}
        <span
          aria-hidden
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_10px_rgba(212,175,106,0.5)] transition-opacity duration-[var(--dur-med)] ${
            dragFrac != null ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{ left: `${frac * 100}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[0.6875rem] tabular-nums tracking-[0.08em] text-text-dim">
        <span>{fmt(shownPos)}</span>
        <span>{fmt(dur)}</span>
      </div>
    </div>
  );
}
