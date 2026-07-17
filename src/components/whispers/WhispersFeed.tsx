"use client";

import { useState } from "react";
import type { WhisperCard } from "@/lib/feed/whispers";
import { copy } from "@/copy/copy";
import { formatWhen } from "@/lib/format/when";
import { FeedPoll } from "./FeedPoll";

/**
 * The Whispers feed (Home). One-way — subjects never post, they only kneel.
 * `signedIn` toggles subject affordances (kneel, poll voting) vs the
 * logged-out public view (read + connect CTA on polls).
 */
export function WhispersFeed({
  items,
  signedIn,
}: {
  items: WhisperCard[];
  signedIn: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-6 text-sm text-text-dim">
        {signedIn ? copy.whispers.empty : copy.whispers.publicEmpty}
      </p>
    );
  }
  return (
    <ul className="mt-6 space-y-3">
      {items.map((w) => (
        <WhisperItem key={w.id} whisper={w} signedIn={signedIn} />
      ))}
    </ul>
  );
}

function WhisperItem({
  whisper,
  signedIn,
}: {
  whisper: WhisperCard;
  signedIn: boolean;
}) {
  const [knelt, setKnelt] = useState(whisper.knelt);
  const [busy, setBusy] = useState(false);

  async function doKneel() {
    if (knelt || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/whispers/${whisper.id}/kneel`, { method: "POST" });
      setKnelt(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
      {whisper.pinned ? (
        <p className="mb-2 label-caps text-gold/80">
          {copy.whispers.pinnedLabel}
        </p>
      ) : null}

      {whisper.body ? <p className="text-text">{whisper.body}</p> : null}

      {whisper.poll ? (
        <FeedPoll poll={whisper.poll} signedIn={signedIn} />
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-text-dim/70" suppressHydrationWarning>
          {whisper.publishedAt ? formatWhen(whisper.publishedAt) : ""}
        </span>
        {signedIn ? (
          <button
            onClick={doKneel}
            disabled={knelt || busy}
            className={`rounded-[var(--radius-full)] border px-4 py-1.5 text-sm transition-colors duration-[var(--dur-med)] ${
              knelt
                ? "border-gold/40 bg-gold/10 text-gold"
                : "border-line text-text-dim hover:border-gold hover:text-gold"
            }`}
          >
            {knelt ? copy.whispers.knelt : copy.whispers.kneel}
          </button>
        ) : null}
      </div>
    </li>
  );
}
