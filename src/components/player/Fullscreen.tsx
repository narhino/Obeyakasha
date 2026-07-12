"use client";

import { useState } from "react";
import { usePlayer, type EndMode } from "@/lib/player/store";
import { beacon } from "@/lib/player/telemetry";
import { copy } from "@/copy/copy";
import {
  IconChevronDown,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
} from "@/components/ui/icons";
import { Spiral } from "./Spiral";

const endModes: { key: EndMode; label: string }[] = [
  { key: "continue", label: copy.player.endMode.continue },
  { key: "stop", label: copy.player.endMode.stop },
  { key: "repeatTrack", label: copy.player.endMode.repeatTrack },
  { key: "repeatPlaylist", label: copy.player.endMode.repeatPlaylist },
];

const spiralVariants = [
  { key: "spiral", label: "Spiral" },
  { key: "double", label: "Twin" },
  { key: "tunnel", label: "Tunnel" },
] as const;

function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[var(--radius-sm)] border px-3 py-1 text-[0.6875rem] tracking-[0.14em] uppercase transition-colors duration-[var(--dur-med)] ${
        active
          ? "border-gold/60 bg-gold/10 text-gold"
          : "border-line/70 text-text-dim hover:text-text"
      }`}
    >
      {children}
    </button>
  );
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

  const [variant, setVariant] =
    useState<(typeof spiralVariants)[number]["key"]>("spiral");
  const [speed, setSpeed] = useState(0.5);

  if (!current || !fullscreen) return null;

  function ground() {
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
        {/* vignette keeps edges dark so type stays legible over the spiral */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(75% 65% at 50% 45%, transparent 40%, rgba(11,8,18,0.82) 100%)",
          }}
        />
      </div>

      <div
        className="flex items-center justify-between px-4 pt-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={() => setFullscreen(false)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line/60 text-text-dim transition-colors hover:text-text"
          aria-label="Minimize"
        >
          <IconChevronDown size={18} />
        </button>
        <div className="flex gap-1.5">
          {spiralVariants.map((v) => (
            <Chip
              key={v.key}
              active={variant === v.key}
              onClick={() => setVariant(v.key)}
            >
              {v.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="label-caps mb-3 text-gold/80">Now under</p>
        <h2 className="max-w-md font-[family-name:var(--font-display)] text-3xl leading-tight text-text [text-shadow:0_2px_24px_rgba(11,8,18,0.9)]">
          {current.title}
        </h2>
        <p className="mt-2 text-xs tracking-[0.14em] text-text-dim">
          {fmt(positionS)} · {fmt(durationS)}
        </p>

        <div className="mt-9 flex items-center gap-7">
          <button
            onClick={prev}
            className="text-text-dim transition-colors hover:text-text"
            aria-label="Previous"
          >
            <IconPrev size={24} />
          </button>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-gold text-bg shadow-[0_0_50px_rgba(212,175,106,0.25)] transition-colors duration-[var(--dur-med)] hover:bg-gold-deep"
          >
            {playing ? <IconPause size={26} /> : <IconPlay size={26} />}
          </button>
          <button
            onClick={next}
            className="text-text-dim transition-colors hover:text-text"
            aria-label="Next"
          >
            <IconNext size={24} />
          </button>
        </div>
      </div>

      <div
        className="space-y-4 border-t border-line/50 bg-surface/85 p-5 backdrop-blur-md"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div>
          <p className="label-caps mb-2">When it ends</p>
          <div className="flex flex-wrap gap-1.5">
            {endModes.map((m) => (
              <Chip
                key={m.key}
                active={endMode === m.key}
                onClick={() => setEndMode(m.key)}
              >
                {m.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-caps mr-1.5">{copy.player.endMode.sleep}</span>
          {[15, 30, 60].map((min) => (
            <Chip
              key={min}
              active={sleepTimerMin === min}
              onClick={() => setSleepTimer(sleepTimerMin === min ? null : min)}
            >
              {min}m
            </Chip>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4">
          <label className="flex flex-1 items-center gap-3">
            <span className="label-caps">Pace</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="h-1 flex-1"
            />
          </label>
          <button
            onClick={ground}
            className="rounded-[var(--radius)] border border-danger/50 px-4 py-1.5 text-[0.6875rem] tracking-[0.14em] uppercase text-danger transition-colors hover:bg-danger/10"
          >
            {copy.player.ground}
          </button>
        </div>
      </div>
    </div>
  );
}
