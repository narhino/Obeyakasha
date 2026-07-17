"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Ornament } from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * The taste closes (R9.8). After a logged-out visitor's free sample ends, this
 * fades an in-voice upsell over the player — "You've had a taste. The rest is
 * earned." — with the Enter CTA. It listens for `akasha:sample-ended`, which
 * PlayerRoot fires ONLY when no one is signed in, so a real subject never meets
 * it. Dismissible, so the catalog stays browsable.
 */
export function SampleUpsell() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onEnded = () => setOpen(true);
    window.addEventListener("akasha:sample-ended", onEnded);
    return () => window.removeEventListener("akasha:sample-ended", onEnded);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/85 px-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-sm rounded-[var(--radius-lg)] border border-gold/30 bg-surface-raised p-8 text-center">
        <Ornament className="mx-auto w-24" />
        <p className="mt-4 font-[family-name:var(--font-display)] text-2xl leading-tight text-text">
          {copy.library.sampleUpsell.title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-text-dim">
          {copy.library.sampleUpsell.body}
        </p>
        <Link href="/signin" className="mt-6 inline-block">
          <Button variant="gold" size="lg">
            {copy.auth.signInButton}
          </Button>
        </Link>
        <button
          onClick={() => setOpen(false)}
          className="mt-4 block w-full text-xs uppercase tracking-[0.14em] text-text-dim transition-colors duration-[var(--dur-med)] hover:text-text"
        >
          {copy.player.dropSkip}
        </button>
      </div>
    </div>
  );
}
