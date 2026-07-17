"use client";

import { useState } from "react";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import { Ornament } from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * The Surrender band (R9.7) — "she chooses". One tap fetches 3–5 tracks the
 * server picked for this subject, drops them into the player as a named source,
 * and opens the fullscreen player. A full-width, breathing, gold-ADJACENT band
 * (gold border + text over accent-soft, never the one solid-gold fill) so it
 * seduces without stealing the page's single-gold rule. Empty result → an
 * in-voice line, never a dead tap.
 */
export function SurrenderBand() {
  const playSource = usePlayer((s) => s.playSource);
  const setFullscreen = usePlayer((s) => s.setFullscreen);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);

  async function surrender() {
    if (busy) return;
    setBusy(true);
    setEmpty(false);
    try {
      const res = await fetch("/api/me/surrender", { cache: "no-store" });
      if (!res.ok) {
        setEmpty(true);
        return;
      }
      const data = (await res.json()) as { tracks?: QueueTrack[] };
      const tracks = data.tracks ?? [];
      if (tracks.length === 0) {
        setEmpty(true);
        return;
      }
      playSource(tracks, copy.library.surrender.sourceName, 0);
      setFullscreen(true);
    } catch {
      setEmpty(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={surrender}
        disabled={busy}
        aria-label={copy.library.surrender.action}
        className="group relative flex w-full items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-gold/40 bg-accent-soft/30 px-6 py-5 text-center transition-all duration-[var(--dur-med)] hover:border-gold/70 active:scale-[0.99] disabled:cursor-wait"
      >
        <span
          aria-hidden
          className="motion-safe:breathe pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 120% at 50% 50%, var(--color-accent-soft) 0%, transparent 75%)",
          }}
        />
        <span className="flex flex-col items-center gap-1.5">
          <Ornament className="w-20" />
          <span className="font-[family-name:var(--font-display)] text-xl tracking-[0.02em] text-gold">
            {busy
              ? copy.library.surrender.choosing
              : copy.library.surrender.action}
          </span>
          <span className="text-xs italic text-text-dim">
            {copy.library.surrender.lead}
          </span>
        </span>
      </button>
      {empty ? (
        <p className="mt-2 text-center text-xs italic text-text-dim">
          {copy.library.surrender.empty}
        </p>
      ) : null}
    </div>
  );
}
