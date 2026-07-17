"use client";

import { usePlayer } from "@/lib/player/store";
import type { LibraryTrack } from "@/lib/library/queries";
import { formatDuration } from "@/lib/format/duration";
import { copy } from "@/copy/copy";

/** "Where I left you" — the returning-subject resume shelf (signed-in only). */
export function ContinueShelf({
  rows,
}: {
  rows: { track: LibraryTrack; positionS: number }[];
}) {
  const playNow = usePlayer((s) => s.playNow);
  if (rows.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm uppercase tracking-wide text-text-dim">
        {copy.library.continueRow}
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {rows.map(({ track }) => (
          <button
            key={track.id}
            onClick={() =>
              track.unlocked &&
              playNow(
                [
                  {
                    id: track.id,
                    title: track.title,
                    durationS: track.durationS,
                    artworkKey: track.artworkKey,
                  },
                ],
                0,
              )
            }
            className="w-40 shrink-0 rounded-[var(--radius-lg)] border border-line bg-surface p-3 text-left"
          >
            <p className="line-clamp-2 text-sm text-text">{track.title}</p>
            <p className="text-xs text-text-dim">
              {formatDuration(track.durationS)}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
