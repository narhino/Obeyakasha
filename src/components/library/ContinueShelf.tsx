"use client";

import { usePlayer, type QueueTrack } from "@/lib/player/store";
import type { LibraryTrack } from "@/lib/library/queries";
import { Cover, Label } from "@/components/ui";
import { IconPlay } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format/duration";
import { copy } from "@/copy/copy";

function toQueueTrack(t: LibraryTrack): QueueTrack {
  return {
    id: t.id,
    title: t.title,
    durationS: t.durationS,
    artworkKey: t.cover,
  };
}

/** "Where I left you" — the returning-subject resume shelf (signed-in only),
 *  set with larger art than the catalog grid so it reads as the way back in. */
export function ContinueShelf({
  rows,
}: {
  rows: { track: LibraryTrack; positionS: number }[];
}) {
  const playNow = usePlayer((s) => s.playNow);
  if (rows.length === 0) return null;

  return (
    <section className="mb-9">
      <Label className="mb-3">{copy.library.continueRow}</Label>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
        {rows.map(({ track }) => (
          <div key={track.id} className="group w-44 shrink-0 sm:w-52">
            <button
              onClick={() =>
                track.unlocked && playNow([toQueueTrack(track)], 0)
              }
              aria-label={`Play ${track.title}`}
              className="block w-full text-left"
            >
              <div className="relative">
                <Cover src={track.cover} className="aspect-square" />
                <span
                  aria-hidden
                  className="glow-gold absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-gold text-bg opacity-95 transition-colors duration-[var(--dur-med)] group-hover:bg-gold-deep"
                >
                  <IconPlay size={17} className="translate-x-[1px]" />
                </span>
              </div>
              <p className="mt-2.5 line-clamp-1 text-sm text-text">
                {track.title}
              </p>
              <p className="text-xs text-text-dim">
                {formatDuration(track.durationS)}
              </p>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
