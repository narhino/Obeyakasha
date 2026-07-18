"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePlayer, type EndMode } from "@/lib/player/store";
import { fallbackToDefaultCover } from "@/lib/art/defaults";
import { beacon } from "@/lib/player/telemetry";
import { copy, fill } from "@/copy/copy";
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

/** End modes as a vertical radio list — each with a one-line whisper (her voice)
 *  describing what she chooses when the track runs out. Behaviour unchanged. */
const END_MODES = [
  {
    key: "continue",
    label: copy.player.endMode.continue,
    whisper: copy.player.drawer.ends.continue,
  },
  {
    key: "stop",
    label: copy.player.endMode.stop,
    whisper: copy.player.drawer.ends.stop,
  },
  {
    key: "repeatTrack",
    label: copy.player.endMode.repeatTrack,
    whisper: copy.player.drawer.ends.repeatTrack,
  },
  {
    key: "repeatPlaylist",
    label: copy.player.endMode.repeatPlaylist,
    whisper: copy.player.drawer.ends.repeatPlaylist,
  },
] as const satisfies readonly { key: EndMode; label: string; whisper: string }[];

/** The spiral's shape — moved out of the top-right corner into "The pull". */
const VARIANTS = [
  { key: "spiral", label: copy.player.drawer.pull.variant.spiral },
  { key: "double", label: copy.player.drawer.pull.variant.double },
  { key: "tunnel", label: copy.player.drawer.pull.variant.tunnel },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

/** Sleep-timer presets (minutes). The store accepts any value; the stepper
 *  fine-tunes between and beyond these. */
const DRIFT_PRESETS = [10, 20, 30, 45, 60, 90] as const;
const DRIFT_MIN = 5;
const DRIFT_MAX = 180;
const DRIFT_STEP = 5;

/** Third-person status fragments for the collapsed bar (a readout of her armed
 *  intent, not her speaking). Keyed for every EndMode incl. the legacy "sleep"
 *  the UI never sets. */
const END_SUMMARY: Record<EndMode, string> = {
  continue: copy.player.drawer.summary.continue,
  stop: copy.player.drawer.summary.stop,
  repeatTrack: copy.player.drawer.summary.repeatTrack,
  repeatPlaylist: copy.player.drawer.summary.repeatPlaylist,
  sleep: copy.player.drawer.summary.continue,
};

const SKIP_S = 15;

/** A quiet crescent — the drift indicator by the scrub bar. Token colour only. */
function Crescent({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M20.5 15.2A8.2 8.2 0 0 1 9.6 4.3a0.7 0.7 0 0 0-.86-.94 9 9 0 1 0 12.7 12.7.7.7 0 0 0-.94-.86Z" />
    </svg>
  );
}

/** A preset pill (sleep-timer minutes + a shared quiet chip). */
function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`rounded-[var(--radius-sm)] border px-3 py-1.5 text-[0.6875rem] tracking-[0.14em] uppercase transition-colors duration-[var(--dur-med)] ${
        active
          ? "border-gold/60 bg-gold/10 text-gold"
          : "border-line/70 text-text-dim hover:border-line hover:text-text"
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

  const [variant, setVariant] = useState<VariantKey>("spiral");
  const [speed, setSpeed] = useState(0.5);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sleep-timer fine-tune draft + a component-local countdown. `armedAt` is set
  // the moment the store's sleepTimerMin changes (arming/re-arming), so the tick
  // below derives a live "time left" that mirrors PlayerRoot's wall-clock
  // deadline WITHOUT touching the frozen store. Cleared when drift disarms.
  const [driftDraft, setDriftDraft] = useState(30);
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const drawerId = useId();
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (sleepTimerMin == null) {
      setArmedAt(null);
      return;
    }
    setArmedAt(Date.now());
    setDriftDraft(sleepTimerMin);
  }, [sleepTimerMin]);

  useEffect(() => {
    if (sleepTimerMin == null) return;
    setNowTs(Date.now());
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sleepTimerMin, armedAt]);

  // Escape collapses the drawer (it's a sheet, never a focus-trapping modal).
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  if (!current || !fullscreen) return null;

  const dur = durationS > 0 ? durationS : (current.durationS ?? 0);
  // The enqueue payload carries a resolved, renderable cover (D1) — never a raw
  // key — so the player can put it centre-stage and behind as room light.
  const cover = current.artworkKey;

  // ── drift (sleep timer) derivations ──────────────────────────────────────
  const driftArmed = sleepTimerMin != null;
  const driftValue = sleepTimerMin ?? driftDraft;
  const nonPresetArmed =
    sleepTimerMin != null &&
    !(DRIFT_PRESETS as readonly number[]).includes(sleepTimerMin);
  const driftLeftMs =
    sleepTimerMin != null && armedAt != null
      ? Math.max(0, sleepTimerMin * 60_000 - (nowTs - armedAt))
      : null;
  const driftLeftMin =
    driftLeftMs != null ? Math.max(1, Math.ceil(driftLeftMs / 60_000)) : null;
  const driftLeftLabel =
    sleepTimerMin != null ? `${driftLeftMin ?? sleepTimerMin}m` : null;

  // ── the collapsed bar's one-line status (in her third person) ─────────────
  const paceWord =
    speed < 0.34
      ? copy.player.drawer.summary.pace.slow
      : speed < 0.67
        ? copy.player.drawer.summary.pace.steady
        : copy.player.drawer.summary.pace.swift;
  const variantLabel = VARIANTS.find((v) => v.key === variant)!.label;

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

  function stepDrift(delta: number) {
    const base = sleepTimerMin ?? driftDraft;
    const nextV = Math.min(DRIFT_MAX, Math.max(DRIFT_MIN, base + delta));
    setDriftDraft(nextV);
    setSleepTimer(nextV); // fine-tuning arms immediately
  }

  function togglePreset(min: number) {
    setSleepTimer(sleepTimerMin === min ? null : min);
  }

  // Radio-list keyboard: arrows move selection (WAI-ARIA radiogroup pattern).
  function onRadioKey(e: React.KeyboardEvent, index: number) {
    const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
    const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
    if (!forward && !back) return;
    e.preventDefault();
    const nextIndex =
      (index + (forward ? 1 : -1) + END_MODES.length) % END_MODES.length;
    setEndMode(END_MODES[nextIndex]!.key);
    radioRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg">
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
      <div aria-hidden className="absolute inset-0 -z-10">
        <Spiral speed={speed} intensity={0.6} variant={variant} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(72% 62% at 50% 45%, transparent 42%, color-mix(in srgb, var(--color-bg) 80%, transparent) 100%)",
          }}
        />
      </div>

      {/* Top row — minimize + queue on the left; the grounding safety on the
          right. Lifted above the drawer's scrim (z-80) so "Bring me back" is
          always one tap away, even with the drawer open. */}
      <div
        className="relative z-[80] flex items-start justify-between px-4 pt-3"
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
        {/* Grounding — a quiet outlined danger, permanently on the stage; never
            filed away inside the drawer. It is a safety control. */}
        <button
          onClick={ground}
          className="rounded-[var(--radius)] border border-danger/50 px-3 py-1.5 text-[0.625rem] tracking-[0.16em] uppercase text-danger transition-colors duration-[var(--dur-med)] hover:border-danger/70 hover:bg-danger/10"
        >
          {copy.player.ground}
        </button>
      </div>

      {/* The stage — sized to always fit: the medallion is capped in viewport
          height terms so the whole column (art, title, scrub, transport) clears
          even the shortest laptop / landscape phone with zero scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[clamp(0.5rem,2.4vh,1.75rem)] px-6 text-center">
        {/* Cover centre-stage, breathing the D2 gold light (its signature home). */}
        <div className="breathes relative aspect-square w-[min(62vw,30vh,16rem)] shrink-0 overflow-hidden rounded-[var(--radius-lg)] border border-gold/25">
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

        <div className="shrink-0">
          <p className="label-caps mb-2 text-gold/80">{copy.player.queue.now}</p>
          <h2
            className="max-w-md font-[family-name:var(--font-display)] text-[clamp(1.5rem,5vh,2.25rem)] leading-tight text-text"
            style={{
              textShadow:
                "0 2px 24px color-mix(in srgb, var(--color-bg) 90%, transparent)",
            }}
          >
            {current.title}
          </h2>
        </div>

        <div className="w-full max-w-md shrink-0">
          {/* Drift ember — a quiet crescent glow by the scrub while a timer is
              armed, with the live countdown. Token colours only. */}
          {driftArmed ? (
            <div className="mb-1.5 flex items-center justify-center gap-1.5 text-gold/85">
              <span className="glow-gold flex h-5 w-5 items-center justify-center rounded-full text-gold/90">
                <Crescent size={13} />
              </span>
              <span className="text-[0.625rem] tracking-[0.16em] uppercase">
                {fill(copy.player.drawer.summary.drift, {
                  left: driftLeftLabel ?? "",
                })}
              </span>
            </div>
          ) : null}
          <ScrubBar
            positionS={positionS}
            durationS={dur}
            bufferedS={bufferedS}
            onSeek={seekTo}
          />
        </div>

        <div className="flex shrink-0 items-center gap-5">
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
            className="flex h-[min(4rem,12vh)] w-[min(4rem,12vh)] items-center justify-center rounded-full bg-gold text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep"
            style={{
              boxShadow:
                "0 0 50px color-mix(in srgb, var(--color-gold) 25%, transparent)",
            }}
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

      {/* ── The nightstand drawer ──────────────────────────────────────────
          Collapsed: a slim glass bar reading back her armed state. Expanded: a
          ritual card that slides up over the stage (which stays mounted). */}

      {/* Collapsed handle — always in flow at the bottom, so the stage never
          jumps. Inert while the sheet is open (the sheet is the live surface). */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-expanded={drawerOpen}
        aria-controls={drawerId}
        aria-label={copy.player.drawer.toggle}
        inert={drawerOpen}
        className="glass elev-3 group relative z-[55] w-full shrink-0 border-t border-line/60 px-5 pt-2.5 transition-colors hover:bg-surface-raised/60"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <span
          aria-hidden
          className="mx-auto mb-2 block h-1 w-9 rounded-full bg-line transition-colors group-hover:bg-line/60"
        />
        <span className="flex min-w-0 items-center justify-center gap-1.5 text-[0.6875rem] tracking-[0.12em]">
          <span className="truncate text-text-dim">{END_SUMMARY[endMode]}</span>
          {driftArmed ? (
            <>
              <span className="text-line" aria-hidden>
                ·
              </span>
              <span className="shrink-0 text-gold/90">
                {fill(copy.player.drawer.summary.drift, {
                  left: driftLeftLabel ?? "",
                })}
              </span>
            </>
          ) : null}
          <span className="text-line" aria-hidden>
            ·
          </span>
          <span className="shrink-0 text-text-dim">
            {variantLabel.toLowerCase()}, {paceWord}
          </span>
        </span>
      </button>

      {/* Scrim — a soft dim that closes on tap. Not focus-trapping. */}
      <button
        type="button"
        aria-hidden={!drawerOpen}
        tabIndex={-1}
        onClick={() => setDrawerOpen(false)}
        className={`absolute inset-0 z-[60] cursor-default bg-bg/45 transition-opacity duration-[var(--dur-med)] ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Expanded sheet — glass elev-3, slides up, scrolls within 60dvh. */}
      <div
        id={drawerId}
        inert={!drawerOpen}
        className={`glass elev-3 absolute inset-x-0 bottom-0 z-[70] max-h-[60dvh] overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-line/60 transition-[transform,opacity] duration-[var(--dur-med)] ease-[var(--ease-trance)] ${
          drawerOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-full opacity-0"
        }`}
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          aria-label={copy.player.drawer.toggle}
          className="group sticky top-0 flex w-full justify-center py-3"
        >
          <span className="h-1 w-9 rounded-full bg-line transition-colors group-hover:bg-text-dim/60" />
        </button>

        <div className="mx-auto max-w-md px-6">
          {/* 1 · How this ends — a vertical radio list of her intents. */}
          <section>
            <p className="label-caps mb-3 text-gold/70">
              {copy.player.drawer.ends.title}
            </p>
            <div role="radiogroup" aria-label={copy.player.drawer.ends.title}>
              {END_MODES.map((m, i) => {
                const active = endMode === m.key;
                return (
                  <button
                    key={m.key}
                    ref={(el) => {
                      radioRefs.current[i] = el;
                    }}
                    role="radio"
                    aria-checked={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setEndMode(m.key)}
                    onKeyDown={(e) => onRadioKey(e, i)}
                    className={`flex w-full items-start gap-3 rounded-[var(--radius)] border px-3.5 py-3 text-left transition-colors duration-[var(--dur-med)] ${
                      active
                        ? "border-gold/45 bg-gold/[0.07]"
                        : "border-transparent hover:border-line/70 hover:bg-surface-raised/40"
                    } ${i > 0 ? "mt-1.5" : ""}`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        active ? "border-gold" : "border-line"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full bg-gold transition-opacity ${
                          active ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block font-[family-name:var(--font-display)] text-lg leading-snug ${
                          active ? "text-text" : "text-text-dim"
                        }`}
                      >
                        {m.label}
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] leading-snug text-text-dim/80">
                        {m.whisper}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2 · Drift — presets + a fine-tune stepper; live armed state. */}
          <section className="mt-7 border-t border-line/40 pt-6">
            <p className="label-caps mb-1.5 text-gold/70">
              {copy.player.drawer.drift.title}
            </p>
            {driftArmed ? (
              <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-text">
                <span>
                  {fill(copy.player.drawer.drift.armed, {
                    left: driftLeftLabel ?? "",
                  })}
                </span>
                <button
                  onClick={() => setSleepTimer(null)}
                  className="text-[0.6875rem] tracking-[0.12em] uppercase text-text-dim transition-colors hover:text-gold"
                >
                  {copy.player.drawer.drift.release}
                </button>
              </p>
            ) : (
              <p className="mb-3 text-[0.9375rem] text-text-dim">
                {copy.player.drawer.drift.whisper}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {DRIFT_PRESETS.map((min) => (
                <Chip
                  key={min}
                  active={sleepTimerMin === min}
                  onClick={() => togglePreset(min)}
                >
                  {min}m
                </Chip>
              ))}
            </div>
            {/* Fine-tune — ±5m; highlights gold when a non-preset value is armed. */}
            <div className="mt-3 flex items-center gap-3">
              <span className="label-caps text-text-dim/70">
                {copy.player.drawer.drift.fine}
              </span>
              <div
                className={`inline-flex items-center rounded-[var(--radius)] border transition-colors ${
                  nonPresetArmed
                    ? "border-gold/60 bg-gold/10"
                    : "border-line/70"
                }`}
              >
                <button
                  onClick={() => stepDrift(-DRIFT_STEP)}
                  disabled={driftValue <= DRIFT_MIN}
                  aria-label={copy.player.drawer.drift.less}
                  className="flex h-9 w-9 items-center justify-center text-lg leading-none text-text-dim transition-colors hover:text-gold disabled:opacity-30"
                >
                  &minus;
                </button>
                <span
                  className={`min-w-[3.25rem] text-center text-sm tabular-nums ${
                    nonPresetArmed ? "text-gold" : "text-text"
                  }`}
                >
                  {driftValue}m
                </span>
                <button
                  onClick={() => stepDrift(DRIFT_STEP)}
                  disabled={driftValue >= DRIFT_MAX}
                  aria-label={copy.player.drawer.drift.more}
                  className="flex h-9 w-9 items-center justify-center text-lg leading-none text-text-dim transition-colors hover:text-gold disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          </section>

          {/* 3 · The pull — spiral shape (segmented), pace, volume (desktop). */}
          <section className="mt-7 border-t border-line/40 pt-6">
            <p className="label-caps mb-3 text-gold/70">
              {copy.player.drawer.pull.title}
            </p>
            <div
              role="radiogroup"
              aria-label={copy.player.drawer.pull.shape}
              className="flex rounded-[var(--radius)] border border-line/70 p-1"
            >
              {VARIANTS.map((v) => {
                const active = variant === v.key;
                return (
                  <button
                    key={v.key}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setVariant(v.key)}
                    className={`flex-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-[0.6875rem] tracking-[0.14em] uppercase transition-colors duration-[var(--dur-med)] ${
                      active
                        ? "bg-gold/12 text-gold"
                        : "text-text-dim hover:text-text"
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>

            <label className="mt-4 flex items-center gap-4">
              <span className="label-caps w-24 shrink-0">
                {copy.player.controls.pace}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="range-gold flex-1"
                aria-label={copy.player.controls.pace}
              />
            </label>

            {/* Volume — desktop only (phones use hardware buttons). */}
            <label className="mt-4 hidden items-center gap-4 md:flex">
              <span className="label-caps w-24 shrink-0">
                {copy.player.controls.volume}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="range-gold flex-1"
                aria-label={copy.player.controls.volume}
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}
