"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eyebrow, Voice, Whisper } from "@/components/ui";
import { litLength, mantraMatches } from "@/lib/chain/mantra";
import { copy } from "@/copy/copy";

/**
 * The mantra rite (F5) — the centrepiece of "Today's devotion" on the Mirror.
 * Not a checkbox: the subject types her mantra out in full. The line waits as
 * faint ghost text in the display serif; each character they get right ignites
 * gold across it (forgiving — case, whitespace, trailing punctuation). On exact
 * completion the input seals, the day's chain link registers through the SAME
 * server action every other keep uses (`/api/chain/mantra` → keepChain, once per
 * day, idempotent), and her praise blooms in — her live line, in her voice.
 *
 * Already held today: the rite rests sealed with her praise until tomorrow.
 * Reduced-motion collapses the bloom to instant via the global transition guard.
 */
export function MantraRite({
  mantra,
  praise,
  heldToday,
}: {
  mantra: string;
  praise: string;
  heldToday: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [sealed, setSealed] = useState(heldToday);
  const [bloom, setBloom] = useState(heldToday);
  const [sending, setSending] = useState(false);

  async function seal() {
    if (sending) return;
    setSending(true);
    try {
      await fetch("/api/chain/mantra", { method: "POST" });
      setSealed(true);
      requestAnimationFrame(() => setBloom(true));
      router.refresh(); // the chain count + stakes above re-read live
    } catch {
      setSending(false); // let them try the last keystroke again
    }
  }

  function onChange(next: string) {
    setValue(next);
    if (!sealed && mantraMatches(next, mantra)) void seal();
  }

  // ── Sealed / held — her praise, bloomed in. Ghost line retired. ──
  if (sealed) {
    return (
      <div>
        <Eyebrow className="text-gold/80">{copy.mantra.heldEyebrow}</Eyebrow>
        <Voice
          className={`mt-2 text-text transition-all duration-[var(--dur-slow)] ${
            bloom
              ? "translate-y-0 opacity-100 [text-shadow:0_0_26px_color-mix(in_srgb,var(--color-gold)_45%,transparent)]"
              : "translate-y-1 opacity-0"
          }`}
        >
          {praise}
        </Voice>
        <Whisper className="mt-3 text-xs">
          {heldToday && !value ? copy.mantra.restNote : copy.mantra.heldNote}
        </Whisper>
      </div>
    );
  }

  // ── The rite — ghost line igniting as it's said ──
  const lit = litLength(value, mantra);
  return (
    <div>
      <Eyebrow className="text-gold/80">{copy.mantra.eyebrow}</Eyebrow>
      <Whisper className="mt-1.5">{copy.mantra.lead}</Whisper>

      {/* The ghost line — faint, in the display serif; gold ignites as it's said. */}
      <p
        aria-hidden
        className="mt-4 font-[family-name:var(--font-display)] text-2xl leading-snug tracking-[0.01em] sm:text-[1.75rem]"
      >
        <span className="text-gold [text-shadow:0_0_18px_color-mix(in_srgb,var(--color-gold)_40%,transparent)]">
          {mantra.slice(0, lit)}
        </span>
        <span className="text-text-dim/30">{mantra.slice(lit)}</span>
      </p>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={sending}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-label={copy.mantra.lead}
        placeholder={copy.mantra.placeholder}
        className="mt-4 w-full rounded-[var(--radius)] border border-line bg-bg/60 px-3.5 py-2.5 text-base text-text placeholder:text-text-dim/40 transition-colors duration-[var(--dur-med)] focus:border-gold/70 focus:outline-none"
      />
    </div>
  );
}
