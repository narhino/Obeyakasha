"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/lib/player/store";
import { postJson } from "@/lib/player/telemetry";
import { copy } from "@/copy/copy";

interface DropTarget {
  sessionId: string;
  trackId: string;
  title: string;
}

/**
 * Post-session drop report (PLAN §9, A9) and the grounding return screen (A20).
 * Both are lightweight overlays driven by window events from the engine.
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
        <p className="font-[family-name:var(--font-display)] text-2xl text-text">
          {copy.player.groundReturn}
        </p>
        <button
          onClick={() => {
            setGrounded(false);
            endGrounding();
            usePlayer.getState().setFullscreen(false);
          }}
          className="mt-8 rounded-[var(--radius)] border border-line px-5 py-2 text-text-dim"
        >
          I&apos;m here
        </button>
      </div>
    );
  }

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-line bg-surface-raised p-5">
        <p className="font-[family-name:var(--font-display)] text-xl text-text">
          {copy.player.dropTitle}
        </p>
        <div className="mt-4 flex justify-between gap-1">
          {copy.player.dropScale.map((label, i) => (
            <button
              key={label}
              onClick={() => submitDepth(i + 1)}
              className="flex flex-1 flex-col items-center rounded-[var(--radius)] border border-line py-2 text-xs text-text-dim hover:border-gold hover:text-gold"
            >
              <span className="text-base">{i + 1}</span>
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy.player.dropNote}
          rows={2}
          className="mt-3 w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
        />
        <button
          onClick={() => setTarget(null)}
          className="mt-2 text-xs text-text-dim/70"
        >
          {copy.player.dropSkip}
        </button>
      </div>
    </div>
  );
}
