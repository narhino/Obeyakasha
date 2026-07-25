"use client";

import { usePlayer, type QueueTrack } from "@/lib/player/store";
import type { LibraryTrack } from "@/lib/library/queries";
import { Cover, Label, Whisper } from "@/components/ui";
import { IconPlay } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format/duration";
import { copy, fill } from "@/copy/copy";

function toQueueTrack(t: LibraryTrack): QueueTrack {
  return {
    id: t.id,
    title: t.title,
    durationS: t.durationS,
    // Carries the resolved cover (D1) so the player chrome shows real art.
    artworkKey: t.cover,
  };
}

/**
 * "Taste her" (R9.8) — the free-sample shelf, shown ONLY to a logged-out
 * visitor. The catalog grid below stays sealed exactly as it was; this shelf is
 * simply the place the few genuinely-playable files are named as such, with
 * larger art (the D5 shelf treatment already used by "Where I left you") so the
 * open ones are unmissable among the sealed covers.
 *
 * Each cover plays alone — a sample never joins a queue, so the taste ends and
 * the upsell closes it (PlayerRoot fires `akasha:sample-ended` for the anonymous).
 */
export function SampleShelf({ tracks }: { tracks: LibraryTrack[] }) {
  const playNow = usePlayer((s) => s.playNow);
  if (tracks.length === 0) return null;

  return (
    <section className="mb-9">
      <Label className="mb-1 text-gold/80">{copy.library.sampleShelf.title}</Label>
      <Whisper className="mb-3 max-w-md text-xs">
        {copy.library.sampleShelf.lead}
      </Whisper>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
        {tracks.map((t) => (
          <div key={t.id} className="group w-40 shrink-0 sm:w-48">
            <button
              onClick={() => playNow([toQueueTrack(t)], 0)}
              aria-label={fill(copy.library.sampleShelf.playLabel, {
                title: t.title,
              })}
              className="block w-full text-left"
            >
              <div className="relative">
                <Cover src={t.cover} className="aspect-square" />
                <span
                  aria-hidden
                  className="glow-gold absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-gold text-bg opacity-95 transition-colors duration-[var(--dur-med)] group-hover:bg-gold-deep"
                >
                  <IconPlay size={17} className="translate-x-[1px]" />
                </span>
                <span className="absolute left-2 top-2 rounded-[var(--radius-sm)] border border-gold/30 bg-bg/70 px-1.5 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] text-gold backdrop-blur-sm">
                  {copy.library.sampleChip}
                </span>
              </div>
              <p className="mt-2.5 line-clamp-2 text-sm leading-snug text-text transition-colors duration-[var(--dur-med)] group-hover:text-gold">
                {t.title}
              </p>
              <p className="text-xs text-text-dim">
                {formatDuration(t.durationS)}
              </p>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
