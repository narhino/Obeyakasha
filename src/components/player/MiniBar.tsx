"use client";

import { usePlayer } from "@/lib/player/store";
import { copy } from "@/copy/copy";
import { IconPause, IconPlay, IconQueue } from "@/components/ui/icons";

function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Floating mini player — sits above the mobile tab bar, docks bottom on desktop. */
export function MiniBar() {
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const positionS = usePlayer((s) => s.positionS);
  const durationS = usePlayer((s) => s.durationS);
  const bufferedS = usePlayer((s) => s.bufferedS);
  const toggle = usePlayer((s) => s.toggle);
  const seekTo = usePlayer((s) => s.seekTo);
  const setFullscreen = usePlayer((s) => s.setFullscreen);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const fullscreen = usePlayer((s) => s.fullscreen);

  if (!current || fullscreen) return null;
  const pct = durationS > 0 ? (positionS / durationS) * 100 : 0;
  const buf = durationS > 0 ? Math.min((bufferedS / durationS) * 100, 100) : 0;

  function tapSeek(e: React.MouseEvent<HTMLButtonElement>) {
    if (durationS <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    seekTo(frac * durationS);
  }

  return (
    <div
      className="fixed inset-x-3 z-40 md:inset-x-0 md:bottom-0"
      style={{
        bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px) + 0.5rem)",
      }}
    >
      <div className="mx-auto max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-line/80 bg-surface-raised/95 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md md:rounded-none md:border-x-0 md:border-b-0">
        {/* tap-to-seek progress strip (with buffered indicator) */}
        <button
          type="button"
          onClick={tapSeek}
          aria-label={copy.player.controls.scrub}
          className="relative block h-2.5 w-full"
        >
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line/60" />
          <span
            className="absolute top-1/2 left-0 h-px -translate-y-1/2 bg-text-dim/35"
            style={{ width: `${buf}%` }}
          />
          <span
            className="absolute top-1/2 left-0 h-px -translate-y-1/2 bg-gold transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </button>
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button
            onClick={() => setFullscreen(true)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate font-[family-name:var(--font-display)] text-[0.9375rem] text-text">
              {current.title}
            </p>
            <p className="text-[0.6875rem] tracking-[0.1em] text-text-dim">
              {fmt(positionS)} · {fmt(durationS)}
            </p>
          </button>
          <button
            onClick={() => setQueueOpen(true)}
            aria-label={copy.player.controls.queue}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-dim transition-colors duration-[var(--dur-med)] hover:text-gold"
          >
            <IconQueue size={19} />
          </button>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep"
          >
            {playing ? <IconPause size={17} /> : <IconPlay size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}
