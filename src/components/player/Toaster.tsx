"use client";

import { useEffect, useRef } from "react";
import { useToasts } from "@/lib/player/toast";

/**
 * Transient toasts (R4) — "Queued: <title>" acknowledgements. Mounted once in
 * PlayerRoot; sits above the mini-player and tab bar. Token-only, auto-dismiss.
 */
const LIFETIME_MS = 2600;

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const map = timers.current;
    for (const t of toasts) {
      if (!map.has(t.id)) {
        map.set(
          t.id,
          setTimeout(() => {
            dismiss(t.id);
            map.delete(t.id);
          }, LIFETIME_MS),
        );
      }
    }
  }, [toasts, dismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
      style={{
        bottom: "calc(7rem + env(safe-area-inset-bottom, 0px))",
      }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto max-w-xs rounded-[var(--radius)] border border-gold/30 bg-surface-raised/95 px-4 py-2 text-center text-xs text-text shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
