"use client";

import { useState } from "react";
import { usePlayer, type EndMode } from "@/lib/player/store";
import { beacon } from "@/lib/player/telemetry";
import { copy } from "@/copy/copy";
import { Spiral } from "./Spiral";

const endModes: { key: EndMode; label: string }[] = [
  { key: "continue", label: copy.player.endMode.continue },
  { key: "stop", label: copy.player.endMode.stop },
  { key: "repeatTrack", label: copy.player.endMode.repeatTrack },
  { key: "repeatPlaylist", label: copy.player.endMode.repeatPlaylist },
];

const spiralVariants = ["spiral", "double", "tunnel"] as const;

function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function Fullscreen() {
  const current = usePlayer((s) => s.current);
  const fullscreen = usePlayer((s) => s.fullscreen);
  const playing = usePlayer((s) => s.playing);
  const positionS = usePlayer((s) => s.positionS);
  const durationS = usePlayer((s) => s.durationS);
  const endMode = usePlayer((s) => s.endMode);
  const sleepTimerMin = usePlayer((s) => s.sleepTimerMin);

  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const setFullscreen = usePlayer((s) => s.setFullscreen);
  const setEndMode = usePlayer((s) => s.setEndMode);
  const setSleepTimer = usePlayer((s) => s.setSleepTimer);
  const beginGrounding = usePlayer((s) => s.beginGrounding);

  const [variant, setVariant] = useState<(typeof spiralVariants)[number]>(
    "spiral",
  );
  const [speed, setSpeed] = useState(0.5);

  if (!current || !fullscreen) return null;

  function ground() {
    // Grounding (A20): stop everything, log the care signal, show return screen.
    const s = usePlayer.getState();
    beginGrounding();
    if (s.current) {
      beacon("/api/listen/end", {
        sessionId: crypto.randomUUID(),
        trackId: s.current.id,
        positionS: Math.round(s.positionS),
        endReason: "grounded",
      });
    }
    window.dispatchEvent(new CustomEvent("akasha:grounded"));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="absolute inset-0 -z-10">
        <Spiral speed={speed} intensity={0.6} variant={variant} />
      </div>

      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => setFullscreen(false)}
          className="text-text-dim hover:text-text"
          aria-label="Minimize"
        >
          ⌄
        </button>
        <div className="flex gap-1">
          {spiralVariants.map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              className={`rounded px-2 py-1 text-xs ${
                variant === v
                  ? "bg-gold text-bg"
                  : "bg-surface/70 text-text-dim"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-3xl text-text drop-shadow">
          {current.title}
        </h2>
        <p className="mt-2 text-sm text-text-dim">
          {fmt(positionS)} / {fmt(durationS)}
        </p>

        <div className="mt-8 flex items-center gap-6">
          <button onClick={prev} className="text-2xl text-text-dim" aria-label="Previous">
            ⏮
          </button>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-gold text-2xl text-bg"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button onClick={next} className="text-2xl text-text-dim" aria-label="Next">
            ⏭
          </button>
        </div>
      </div>

      <div className="space-y-4 bg-surface/80 p-5 backdrop-blur">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-text-dim">
            When it ends
          </p>
          <div className="flex flex-wrap gap-2">
            {endModes.map((m) => (
              <button
                key={m.key}
                onClick={() => setEndMode(m.key)}
                className={`rounded-[var(--radius-full)] border px-3 py-1 text-sm ${
                  endMode === m.key
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-line text-text-dim"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-text-dim">
            {copy.player.endMode.sleep}
          </span>
          {[15, 30, 60].map((min) => (
            <button
              key={min}
              onClick={() => setSleepTimer(sleepTimerMin === min ? null : min)}
              className={`rounded-[var(--radius-full)] border px-3 py-1 text-sm ${
                sleepTimerMin === min
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-line text-text-dim"
              }`}
            >
              {min}m
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex flex-1 items-center gap-2 text-xs text-text-dim">
            speed
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="flex-1 accent-[var(--color-gold)]"
            />
          </label>
          <button
            onClick={ground}
            className="rounded-[var(--radius)] border border-danger px-4 py-2 text-sm text-danger"
          >
            {copy.player.ground}
          </button>
        </div>
      </div>
    </div>
  );
}
