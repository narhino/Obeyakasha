"use client";

import { useState } from "react";
import type { WhisperCard } from "@/lib/feed/whispers";
import { copy } from "@/copy/copy";
import { formatWhen } from "@/lib/format/when";
import { Eyebrow, Voice } from "@/components/ui";
import { FeedPoll } from "./FeedPoll";

/**
 * The Whispers feed (Home). One-way — subjects never post, they only kneel.
 * Pinned whispers open as large editorial cards; her words are set in the D3
 * voice (italic display), and any image she attached blooms above the words as
 * the card's art. `signedIn` toggles subject affordances (kneel, poll voting)
 * vs the logged-out public view (read + connect CTA on polls).
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
      <p className="mt-8 font-[family-name:var(--font-display)] text-lg italic text-text-dim">
        {signedIn ? copy.whispers.empty : copy.whispers.publicEmpty}
      </p>
    );
  }
  return (
    <ul className="enter-stagger mt-8 space-y-4">
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
  const featured = whisper.pinned;

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
    <li
      className={`overflow-hidden rounded-[var(--radius-lg)] border ${
        featured
          ? "border-gold/30 bg-surface-raised elev-2"
          : "border-line/80 bg-surface"
      }`}
    >
      {whisper.imageUrl ? (
        <div
          className={`relative w-full overflow-hidden ${
            featured ? "aspect-[16/9]" : "aspect-[5/2]"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={whisper.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
          {/* Scrim melts the image into the card body below. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, var(--color-surface), transparent 62%)",
            }}
          />
        </div>
      ) : null}

      <div className={featured ? "p-6 sm:p-7" : "p-4 sm:p-5"}>
        {whisper.pinned ? (
          <Eyebrow className="mb-3 text-gold/80">
            {copy.whispers.pinnedLabel}
          </Eyebrow>
        ) : null}

        {whisper.body ? (
          featured ? (
            <p className="font-[family-name:var(--font-display)] text-2xl leading-[1.28] italic text-text sm:text-[1.75rem]">
              {whisper.body}
            </p>
          ) : (
            <Voice className="leading-relaxed">{whisper.body}</Voice>
          )
        ) : null}

        {whisper.poll ? (
          <FeedPoll poll={whisper.poll} signedIn={signedIn} />
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="label-caps text-text-dim/60" suppressHydrationWarning>
            {whisper.publishedAt ? formatWhen(whisper.publishedAt) : ""}
          </span>
          {signedIn ? (
            <button
              onClick={doKneel}
              disabled={knelt || busy}
              className={`rounded-[var(--radius-full)] border px-5 py-1.5 text-sm tracking-[0.06em] transition-colors duration-[var(--dur-med)] ${
                knelt
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-line text-text-dim hover:border-gold hover:text-gold"
              }`}
            >
              {knelt ? copy.whispers.knelt : copy.whispers.kneel}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
