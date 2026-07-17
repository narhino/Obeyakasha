"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { probeDuration, uploadAudio } from "../upload-client";

/**
 * Single-file attach control (ROADMAP-v1.5 R8). Picks one audio file and streams
 * it onto a waiting Patreon shell via /api/sanctum/upload?trackId=. Used per-row
 * on the Import page; the bulk screen handles many at once. Refreshes the server
 * component on success so the shell flips to "imported".
 */
export function AttachButton({
  trackId,
  label = "Attach",
}: {
  trackId: string;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File) {
    setError(null);
    setPct(0);
    try {
      const durationS = await probeDuration(file);
      await uploadAudio(file, {
        trackId,
        durationS,
        onProgress: (f) => setPct(Math.round(f * 100)),
      });
      setPct(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setPct(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pct !== null}
        className="inline-flex items-center rounded-[var(--radius)] border border-line px-3 py-1.5 text-[0.75rem] uppercase tracking-[0.08em] text-text-dim transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pct !== null ? `${pct}%` : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
          e.target.value = "";
        }}
      />
      {error ? <span className="text-[0.7rem] text-danger">{error}</span> : null}
    </div>
  );
}
