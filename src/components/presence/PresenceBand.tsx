"use client";

import { copy } from "@/copy/copy";
import { usePresence } from "./PresenceProvider";

/**
 * The "She is here" band (F4) — a slim emerald ribbon that eases open under the
 * header while she's on the app, and eases shut when she leaves. Its height and
 * opacity transition, so nothing below it jumps (no layout shift); under
 * reduced-motion the global guard collapses the transition to an instant state.
 */
export function PresenceBand() {
  const { online } = usePresence();
  return (
    <div
      aria-hidden={!online}
      className={`overflow-hidden transition-[max-height,opacity] duration-[var(--dur-slow)] ${
        online ? "max-h-14 opacity-100" : "max-h-0 opacity-0"
      }`}
      style={{ transitionTimingFunction: "var(--ease-trance)" }}
    >
      <div className="glow-presence border-b border-presence/25 bg-[color-mix(in_srgb,var(--color-presence)_7%,transparent)]">
        <div className="mx-auto flex max-w-2xl items-center justify-center gap-2.5 px-4 py-2">
          <span
            aria-hidden
            className="presence-lit inline-block h-1.5 w-1.5 rounded-full bg-presence"
          />
          <span className="font-[family-name:var(--font-display)] text-sm italic tracking-[0.03em] text-presence">
            {copy.presence.band}
          </span>
        </div>
      </div>
    </div>
  );
}
