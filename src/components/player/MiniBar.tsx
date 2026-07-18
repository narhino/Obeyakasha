"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/lib/player/store";
import { formatDuration } from "@/lib/format/duration";
import { copy } from "@/copy/copy";
import { IconPause, IconPlay, IconQueue, IconSeal } from "@/components/ui/icons";

/**
 * The title line — truncates when it fits, and on overflow drifts gently to
 * reveal its tail before returning (a slow marquee, not a ticker). A soft
 * right-edge mask hides the hard clip. Motionless under reduced-motion.
 */
function TitleLine({ text }: { text: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const measure = () => {
      setReduce(mq.matches);
      setOverflow(Math.max(0, inner.scrollWidth - box.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    mq.addEventListener?.("change", measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener?.("change", measure);
    };
  }, [text]);

  const overflowing = overflow > 4;
  const animate = overflowing && !reduce;

  return (
    <span
      ref={boxRef}
      className="block overflow-hidden"
      style={
        overflowing
          ? {
              maskImage: "linear-gradient(to right, #000 86%, transparent)",
              WebkitMaskImage: "linear-gradient(to right, #000 86%, transparent)",
            }
          : undefined
      }
    >
      <span
        ref={innerRef}
        className={`block whitespace-nowrap font-[family-name:var(--font-display)] text-[0.9375rem] leading-tight text-text ${
          animate ? "marquee-move" : ""
        }`}
        style={
          animate
            ? ({
                "--marquee-shift": `-${overflow}px`,
                "--marquee-dur": `${Math.max(7, overflow / 14 + 6)}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
}

/** Artwork tile — the enqueue payload carries a resolved, renderable cover URL
 *  (D1: signed upload or bespoke default), never a raw storage key, so we show
 *  the real cover. Falls back to the 888 sigil (breathing while she plays,
 *  steady under reduced-motion via the global rule) when a track has none. */
function ArtTile({ src, playing }: { src: string | null; playing: boolean }) {
  return (
    <span
      aria-hidden
      className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius)] border border-line/70 bg-accent-soft/50 text-gold/85"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <IconSeal size={20} className={playing ? "breathe" : undefined} />
      )}
    </span>
  );
}

/**
 * The mini-player (R4/P1, F11+F12). Docked flush on top of the bottom tab bar
 * as one object with two shelves — full-bleed, raised over the deeper nav, an
 * ultra-thin tap-to-seek line along its top edge. Anatomy after Spotify's:
 * artwork · title + source · queue · play/pause with a real pressed feel.
 * Tapping the artwork/title opens the (untouched) fullscreen player.
 */
export function MiniBar() {
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const positionS = usePlayer((s) => s.positionS);
  const durationS = usePlayer((s) => s.durationS);
  const bufferedS = usePlayer((s) => s.bufferedS);
  const sourceName = usePlayer((s) => s.sourceName);
  const toggle = usePlayer((s) => s.toggle);
  const seekTo = usePlayer((s) => s.seekTo);
  const setFullscreen = usePlayer((s) => s.setFullscreen);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const fullscreen = usePlayer((s) => s.fullscreen);

  if (!current || fullscreen) return null;
  const dur = durationS > 0 ? durationS : (current.durationS ?? 0);
  const pct = dur > 0 ? Math.min((positionS / dur) * 100, 100) : 0;
  const buf = dur > 0 ? Math.min((bufferedS / dur) * 100, 100) : 0;

  // Secondary line: the source she's playing from, else the length, else her name.
  const subline =
    sourceName || formatDuration(current.durationS) || copy.brand.name;

  function tapSeek(e: React.MouseEvent<HTMLButtonElement>) {
    if (dur <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    seekTo(frac * dur);
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] z-40 md:bottom-0">
      {/* Floating glass chrome (D2): translucent raised surface + backdrop blur
          (.glass) lifted on --elev-3. Docked flush over the deeper nav. */}
      <div className="glass elev-3 border-t border-line/70">
        {/* ultra-thin tap-to-seek line along the TOP edge (buffered + played) */}
        <button
          type="button"
          onClick={tapSeek}
          aria-label={copy.player.controls.scrub}
          className="group relative block h-2 w-full"
        >
          <span className="absolute inset-x-0 top-0 h-[2px] bg-line/70" />
          <span
            className="absolute top-0 left-0 h-[2px] bg-text-dim/30"
            style={{ width: `${buf}%` }}
          />
          <span
            className="absolute top-0 left-0 h-[2px] bg-gold transition-[width] duration-500 group-hover:h-[3px]"
            style={{ width: `${pct}%` }}
          />
        </button>

        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 pt-1.5 pb-2.5 sm:px-4">
          <button
            onClick={() => setFullscreen(true)}
            aria-label={current.title}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <ArtTile src={current.artworkKey} playing={playing} />
            <span className="min-w-0 flex-1">
              <TitleLine text={current.title} />
              <span className="mt-0.5 block truncate text-[0.6875rem] tracking-[0.08em] text-text-dim">
                {subline}
              </span>
            </span>
          </button>

          <button
            onClick={() => setQueueOpen(true)}
            aria-label={copy.player.controls.queue}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-dim transition-colors duration-[var(--dur-med)] hover:text-gold active:text-gold"
          >
            <IconQueue size={19} />
          </button>

          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-bg shadow-[0_0_20px_rgba(212,175,106,0.18)] transition hover:bg-gold-deep active:scale-90"
          >
            {playing ? (
              <IconPause size={18} />
            ) : (
              <IconPlay size={18} className="translate-x-[1px]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
