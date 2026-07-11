"use client";

import { usePlayer } from "@/lib/player/store";

function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function MiniBar() {
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const positionS = usePlayer((s) => s.positionS);
  const durationS = usePlayer((s) => s.durationS);
  const toggle = usePlayer((s) => s.toggle);
  const setFullscreen = usePlayer((s) => s.setFullscreen);
  const fullscreen = usePlayer((s) => s.fullscreen);

  if (!current || fullscreen) return null;
  const pct = durationS > 0 ? (positionS / durationS) * 100 : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
      <div className="h-0.5 w-full bg-line">
        <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
      </div>
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <button
          onClick={() => setFullscreen(true)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm text-text">{current.title}</p>
          <p className="text-xs text-text-dim">
            {fmt(positionS)} / {fmt(durationS)}
          </p>
        </button>
        <button
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-bg"
        >
          {playing ? "❚❚" : "▶"}
        </button>
      </div>
    </div>
  );
}
