"use client";

import { useState } from "react";
import { usePlayer, type EndMode } from "@/lib/player/store";
import { fallbackToDefaultCover } from "@/lib/art/defaults";
import { beacon } from "@/lib/player/telemetry";
import { copy } from "@/copy/copy";
import {
  IconChevronDown,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconQueue,
  IconSeal,
  IconSkipBack15,
  IconSkipForward15,
} from "@/components/ui/icons";
import { Spiral } from "./Spiral";
import { ScrubBar } from "./ScrubBar";

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

const SKIP_S = 15;

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

export function Fullscreen({ signedIn = true }: { signedIn?: boolean }) {
  const current = usePlayer((s) => s.current);
  const fullscreen = usePlayer((s) => s.fullscreen);
  const playing = usePlayer((s) => s.playing);
  const positionS = usePlayer((s) => s.positionS);
  const durationS = usePlayer((s) => s.durationS);
  const bufferedS = usePlayer((s) => s.bufferedS);
  const volume = usePlayer((s) => s.volume);
  const endMode = usePlayer((s) => s.endMode);
  const sleepTimerMin = usePlayer((s) => s.sleepTimerMin);

  const toggle = usePlayer((s) => s.toggle);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const seekTo = usePlayer((s) => s.seekTo);
  const setVolume = usePlayer((s) => s.setVolume);
  const setFullscreen = usePlayer((s) => s.setFullscreen);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const setEndMode = usePlayer((s) => s.setEndMode);
  const setSleepTimer = usePlayer((s) => s.setSleepTimer);
  const beginGrounding = usePlayer((s) => s.beginGrounding);

  const [variant, setVariant] =
    useState<(typeof spiralVariants)[number]["key"]>("spiral");
  const [speed, setSpeed] = useState(0.5);

  if (!current || !fullscreen) return null;

  const dur = durationS > 0 ? durationS : (current.durationS ?? 0);
  // The enqueue payload carries a resolved, renderable cover (D1) — never a raw
  // key — so the player can put it centre-stage and behind as room light.
  const cover = current.artworkKey;

  function ground() {
    const s = usePlayer.getState();
    beginGrounding();
    // Subjects only — the listen endpoint is gated, so an anon sample listener
    // grounds without a (silently-failing) telemetry beacon (R9.8).
    if (signedIn && s.current) {
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
      {/* Room light: the SAME cover, blurred + dimmed, filling the space behind
          everything (a cheap CSS filter — no canvas). */}
      <div aria-hidden className="absolute inset-0 -z-20 overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            onError={fallbackToDefaultCover}
            className="h-full w-full object-cover"
            style={{
              filter: "blur(64px) brightness(0.42) saturate(1.15)",
              transform: "scale(1.25)",
            }}
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(75% 60% at 50% 42%, transparent 22%, color-mix(in srgb, var(--color-bg) 82%, transparent) 100%)",
          }}
        />
      </div>
      {/* The spiral, kept — variant + pace still drive it — ambient behind the
          breathing cover medallion. */}
      <div className="absolute inset-0 -z-10">
        <Spiral speed={speed} intensity={0.6} variant={variant} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(72% 62% at 50% 45%, transparent 42%, color-mix(in srgb, var(--color-bg) 80%, transparent) 100%)",
          }}
        />
      </div>

      <div
        className="flex items-center justify-between px-4 pt-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFullscreen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line/60 text-text-dim transition-colors hover:text-text"
            aria-label={copy.player.controls.minimize}
          >
            <IconChevronDown size={18} />
          </button>
          <button
            onClick={() => setQueueOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line/60 text-text-dim transition-colors hover:text-gold"
            aria-label={copy.player.controls.queue}
          >
            <IconQueue size={18} />
          </button>
        </div>
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
        {/* Cover centre-stage, breathing the D2 gold light (its signature home). */}
        <div className="breathes relative mb-8 w-56 max-w-[60vw] overflow-hidden rounded-[var(--radius-lg)] border border-gold/25 sm:w-64">
          <div className="aspect-square">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                onError={fallbackToDefaultCover}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-accent-soft/40 text-gold/80">
                <IconSeal size={44} />
              </div>
            )}
          </div>
        </div>
        <p className="label-caps mb-3 text-gold/80">{copy.player.queue.now}</p>
        <h2
          className="max-w-md font-[family-name:var(--font-display)] text-[2rem] leading-tight text-text sm:text-4xl"
          style={{
            textShadow:
              "0 2px 24px color-mix(in srgb, var(--color-bg) 90%, transparent)",
          }}
        >
          {current.title}
        </h2>

        <div className="mt-8 w-full max-w-md">
          <ScrubBar
            positionS={positionS}
            durationS={dur}
            bufferedS={bufferedS}
            onSeek={seekTo}
          />
        </div>

        <div className="mt-7 flex items-center gap-5">
          <button
            onClick={prev}
            className="text-text-dim transition-colors hover:text-text"
            aria-label={copy.player.controls.prev}
          >
            <IconPrev size={22} />
          </button>
          <button
            onClick={() => seekTo(Math.max(0, positionS - SKIP_S))}
            className="text-text-dim transition-colors hover:text-gold"
            aria-label={copy.player.controls.back15}
          >
            <IconSkipBack15 size={26} />
          </button>
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-gold text-bg shadow-[0_0_50px_rgba(212,175,106,0.25)] transition-colors duration-[var(--dur-med)] hover:bg-gold-deep"
          >
            {playing ? <IconPause size={26} /> : <IconPlay size={26} />}
          </button>
          <button
            onClick={() =>
              seekTo(dur > 0 ? Math.min(dur, positionS + SKIP_S) : positionS + SKIP_S)
            }
            className="text-text-dim transition-colors hover:text-gold"
            aria-label={copy.player.controls.forward15}
          >
            <IconSkipForward15 size={26} />
          </button>
          <button
            onClick={next}
            className="text-text-dim transition-colors hover:text-text"
            aria-label={copy.player.controls.next}
          >
            <IconNext size={22} />
          </button>
        </div>
      </div>

      <div
        className="glass elev-3 space-y-4 border-t border-line/60 p-5"
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

        {/* Volume — desktop only (phones use hardware buttons). */}
        <label className="hidden items-center gap-3 md:flex">
          <span className="label-caps">{copy.player.controls.volume}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="h-1 flex-1"
            aria-label={copy.player.controls.volume}
          />
        </label>

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
