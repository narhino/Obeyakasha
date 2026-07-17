"use client";

import Link from "next/link";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import { toast } from "@/lib/player/toast";
import { Button } from "@/components/ui";
import { IconPlay, IconSpark } from "@/components/ui/icons";
import { copy, fill } from "@/copy/copy";

/**
 * The file page's primary action (R3), reusing R2a's three-state logic:
 *  - entitled → big gold Play (feeds the shared player playNow) + "+ queue";
 *  - locked   → Upgrade → Patreon;
 *  - anon     → Enter with Patreon → /signin.
 * Play/queue behaviour matches the catalog list exactly.
 */
export function FilePlayAction({
  track,
  state,
  patreonPageUrl,
  isSample = false,
  premiereWhen = null,
}: {
  track: QueueTrack;
  state: "entitled" | "locked" | "anon";
  patreonPageUrl: string;
  /** Published free sample — the unentitled/logged-out may still taste it (R9.8). */
  isSample?: boolean;
  /** Premiere countdown phrase (R9.6). Non-null → sealed until its moment: a
   *  glowing countdown replaces every play/upgrade action, for everyone. */
  premiereWhen?: string | null;
}) {
  const playNow = usePlayer((s) => s.playNow);
  const addToQueue = usePlayer((s) => s.addToQueue);

  // Premiere seals playback for everyone until it begins — anticipation, not a
  // lock. Overrides entitled / sample / locked / anon alike (R9.6).
  if (premiereWhen) {
    return (
      <div className="inline-flex items-center gap-3 rounded-[var(--radius)] border border-gold/40 bg-gold/5 px-5 py-3">
        <span
          aria-hidden
          className="text-gold [text-shadow:0_0_18px_rgba(212,175,106,0.5)]"
        >
          <IconSpark size={20} />
        </span>
        <span>
          <span className="label-caps block text-gold/80">
            {copy.library.premiere.chip}
          </span>
          <span className="font-[family-name:var(--font-display)] text-lg italic text-text">
            {fill(copy.library.premiere.countdown, { when: premiereWhen })}
          </span>
        </span>
      </div>
    );
  }

  if (state === "entitled") {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => playNow([track], 0)}
          className="inline-flex items-center gap-2.5 rounded-[var(--radius)] bg-gold px-6 py-3 text-sm font-medium uppercase tracking-[0.08em] text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep"
        >
          <IconPlay size={18} />
          {copy.library.filePage.play}
        </button>
        <button
          onClick={() => {
            addToQueue(track);
            toast(fill(copy.player.queue.queued, { title: track.title }));
          }}
          className="text-xs text-text-dim transition-colors duration-[var(--dur-med)] hover:text-gold"
        >
          {copy.library.queue}
        </button>
      </div>
    );
  }

  // Not entitled, but a published free sample → the public may play it, then
  // meet the upsell when it ends (R9.8). Gold Play + the "free taste" chip.
  if (isSample) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => playNow([track], 0)}
          className="inline-flex items-center gap-2.5 rounded-[var(--radius)] bg-gold px-6 py-3 text-sm font-medium uppercase tracking-[0.08em] text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep"
        >
          <IconPlay size={18} />
          {copy.library.filePage.play}
        </button>
        <span className="inline-flex items-center rounded-[var(--radius-sm)] border border-gold/30 bg-gold/10 px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] text-gold">
          {copy.library.sampleChip}
        </span>
      </div>
    );
  }

  // Locked / anon: wine (secondary) so gold stays rationed to one primary per
  // screen — the header Enter for anon, the Play for the entitled (F16).
  if (state === "locked") {
    return (
      <a href={patreonPageUrl} target="_blank" rel="noreferrer">
        <Button size="lg" variant="primary">
          {copy.library.unlockCta}
        </Button>
      </a>
    );
  }

  return (
    <Link href="/signin">
      <Button size="lg" variant="primary">
        {copy.auth.signInButton}
      </Button>
    </Link>
  );
}
