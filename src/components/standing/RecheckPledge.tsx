"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * "I've already paid — look again."
 *
 * Someone who upgrades or resumes on Patreon and still sees a sealed library
 * has exactly one recourse today: write to her and wait. That is the worst
 * possible moment to make someone wait, because they have just paid MORE.
 *
 * This re-reads Patreon with their own token on the spot. The app also does it
 * on its own in the background, so most people will never need this — but the
 * one who does need it can fix it themselves in a second, and the answer is
 * stated either way instead of leaving them guessing.
 */
export function RecheckPledge() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch("/api/me/recheck", { method: "POST" });
      const data = (await res.json()) as {
        checked?: boolean;
        frozen?: boolean;
        restored?: boolean;
      };
      if (data.restored) {
        setSaid(copy.standing.recheckRestored);
        router.refresh();
      } else if (data.checked && !data.frozen) {
        setSaid(copy.standing.recheckRestored);
        router.refresh();
      } else if (data.checked) {
        setSaid(copy.standing.recheckNothing);
      } else {
        setSaid(copy.standing.recheckCant);
      }
    } catch {
      setSaid(copy.standing.recheckCant);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={check}
        disabled={busy}
        className="text-xs uppercase tracking-[0.1em] text-text-dim underline underline-offset-4 transition-colors duration-[var(--dur-med)] hover:text-gold disabled:opacity-50"
      >
        {busy ? copy.standing.recheckBusy : copy.standing.recheck}
      </button>
      {said ? <Whisper className="mt-1.5 text-xs">{said}</Whisper> : null}
    </div>
  );
}
