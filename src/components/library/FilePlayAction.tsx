"use client";

import Link from "next/link";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import { Button } from "@/components/ui";
import { IconPlay } from "@/components/ui/icons";
import { copy } from "@/copy/copy";

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
}: {
  track: QueueTrack;
  state: "entitled" | "locked" | "anon";
  patreonPageUrl: string;
}) {
  const playNow = usePlayer((s) => s.playNow);
  const addToQueue = usePlayer((s) => s.addToQueue);

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
          onClick={() => addToQueue(track)}
          className="text-xs text-text-dim transition-colors duration-[var(--dur-med)] hover:text-gold"
        >
          {copy.library.queue}
        </button>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <a href={patreonPageUrl} target="_blank" rel="noreferrer">
        <Button size="lg" variant="gold">
          {copy.library.unlockCta}
        </Button>
      </a>
    );
  }

  return (
    <Link href="/signin">
      <Button size="lg" variant="gold">
        {copy.auth.signInButton}
      </Button>
    </Link>
  );
}
