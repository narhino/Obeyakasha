"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/lib/player/store";
import { postJson } from "@/lib/player/telemetry";
import { copy } from "@/copy/copy";
import { Ornament } from "@/components/ui";

interface DropTarget {
  sessionId: string;
  trackId: string;
  title: string;
}

const NUMERALS = ["I", "II", "III", "IV", "V"];

/**
 * Post-session drop report (A9) + the grounding return screen (A20).
 * Framed as reporting for inspection — roman numerals, not star ratings.
 */
export function DropPrompt() {
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [note, setNote] = useState("");
  const [grounded, setGrounded] = useState(false);
  const endGrounding = usePlayer((s) => s.endGrounding);

  useEffect(() => {
    const onDrop = (e: Event) => {
      const detail = (e as CustomEvent<DropTarget>).detail;
      setTarget(detail);
      setNote("");
    };
    const onGrounded = () => setGrounded(true);
    window.addEventListener("akasha:drop-prompt", onDrop);
    window.addEventListener("akasha:grounded", onGrounded);
    return () => {
      window.removeEventListener("akasha:drop-prompt", onDrop);
      window.removeEventListener("akasha:grounded", onGrounded);
    };
  }, []);

  function submitDepth(depth: number) {
    if (!target) return;
    void postJson("/api/drop-report", {
      sessionId: target.sessionId,
      trackId: target.trackId,
      depth,
      note: note.trim() || null,
    });
    setTarget(null);
  }

  if (grounded) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg px-6 text-center">
        <Ornament className="mb-8 w-40" />
        <p className="max-w-sm font-[family-name:var(--font-display)] text-2xl leading-snug text-text">
          {copy.player.groundReturn}
        </p>
        <button
          onClick={() => {
            setGrounded(false);
            endGrounding();
            usePlayer.getState().setFullscreen(false);
          }}
          className="mt-10 rounded-[var(--radius)] border border-line px-6 py-2.5 text-[0.75rem] tracking-[0.14em] uppercase text-text-dim transition-colors hover:border-text-dim hover:text-text"
        >
          I&apos;m here
        </button>
      </div>
    );
  }

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-bg/75 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-line bg-surface-raised p-6 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <p className="text-center font-[family-name:var(--font-display)] text-2xl text-text">
          {copy.player.dropTitle}
        </p>
        <Ornament className="mx-auto mt-3 w-28" />
        <div className="mt-5 flex justify-between gap-1.5">
          {copy.player.dropScale.map((label, i) => (
            <button
              key={label}
              onClick={() => submitDepth(i + 1)}
              className="group flex flex-1 flex-col items-center gap-1 rounded-[var(--radius)] border border-line/70 py-2.5 transition-colors duration-[var(--dur-med)] hover:border-gold/60 hover:bg-gold/5"
            >
              <span className="font-[family-name:var(--font-display)] text-lg text-text-dim transition-colors group-hover:text-gold">
                {NUMERALS[i]}
              </span>
              <span className="text-[0.5625rem] tracking-[0.12em] uppercase text-text-dim/70">
                {label}
              </span>
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy.player.dropNote}
          rows={2}
          className="mt-4 w-full rounded-[var(--radius)] border border-line bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-text-dim/45 focus:border-gold/70 focus:outline-none"
        />
        <button
          onClick={() => setTarget(null)}
          className="mt-3 w-full text-center text-[0.6875rem] tracking-[0.14em] uppercase text-text-dim/60 transition-colors hover:text-text-dim"
        >
          {copy.player.dropSkip}
        </button>
      </div>
    </div>
  );
}
