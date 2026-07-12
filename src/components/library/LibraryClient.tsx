"use client";

import { useMemo, useState } from "react";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import type { LibraryTrack } from "@/lib/library/queries";
import { Badge } from "@/components/ui";
import { IconLock, IconPlay } from "@/components/ui/icons";
import { KeepButton } from "@/components/offline/KeepButton";
import { copy, fill } from "@/copy/copy";

function toQueueTrack(t: LibraryTrack): QueueTrack {
  return {
    id: t.id,
    title: t.title,
    durationS: t.durationS,
    artworkKey: t.artworkKey,
  };
}

function fmt(s: number | null): string {
  if (s == null) return "";
  const m = Math.floor(s / 60);
  return `${m} min`;
}

const PURPOSES = ["induction", "deepening", "conditioning", "trigger", "maintenance", "sleep"];

export function LibraryClient({
  tracks,
  continueRow,
}: {
  tracks: LibraryTrack[];
  continueRow: { track: LibraryTrack; positionS: number }[];
}) {
  const playNow = usePlayer((s) => s.playNow);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return tracks.filter((t) => {
      if (purpose && !t.tags.some((tag) => tag.kind === "purpose" && tag.value === purpose))
        return false;
      if (query && !t.title.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [tracks, purpose, query]);

  const unlocked = filtered.filter((t) => t.unlocked);

  function playFrom(list: LibraryTrack[], index: number) {
    const queue = list.filter((t) => t.unlocked).map(toQueueTrack);
    const startId = list[index]?.id;
    const startIndex = queue.findIndex((q) => q.id === startId);
    if (startIndex >= 0) playNow(queue, startIndex);
  }

  return (
    <div>
      {continueRow.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm uppercase tracking-wide text-text-dim">
            {copy.library.continueRow}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {continueRow.map(({ track }) => (
              <button
                key={track.id}
                onClick={() => track.unlocked && playNow([toQueueTrack(track)], 0)}
                className="w-40 shrink-0 rounded-[var(--radius-lg)] border border-line bg-surface p-3 text-left"
              >
                <p className="truncate text-sm text-text">{track.title}</p>
                <p className="text-xs text-text-dim">{fmt(track.durationS)}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="rounded-[var(--radius)] border border-line bg-bg px-3 py-1.5 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
        />
        <button
          onClick={() => setPurpose(null)}
          className={`rounded-[var(--radius-full)] border px-3 py-1 text-xs ${
            purpose === null ? "border-gold text-gold" : "border-line text-text-dim"
          }`}
        >
          all
        </button>
        {PURPOSES.map((p) => (
          <button
            key={p}
            onClick={() => setPurpose(purpose === p ? null : p)}
            className={`rounded-[var(--radius-full)] border px-3 py-1 text-xs ${
              purpose === p ? "border-gold text-gold" : "border-line text-text-dim"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-text-dim">{copy.library.empty}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t, i) => (
            <li
              key={t.id}
              className={`flex items-center gap-3 rounded-[var(--radius-lg)] border border-line p-3 ${
                t.unlocked ? "bg-surface" : "bg-surface/40"
              }`}
            >
              <button
                disabled={!t.unlocked}
                onClick={() => playFrom(filtered, i)}
                aria-label={`Play ${t.title}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep disabled:bg-surface-raised disabled:text-text-dim/60"
              >
                {t.unlocked ? <IconPlay size={16} /> : <IconLock size={16} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">
                  {t.title}
                  {t.madeForYou ? (
                    <span className="ml-2 text-xs text-gold">{copy.library.madeForYou}</span>
                  ) : null}
                </p>
                <p className="text-xs text-text-dim">
                  {fmt(t.durationS)}
                  {t.tags.length > 0
                    ? " · " + t.tags.slice(0, 2).map((tag) => tag.value).join(", ")
                    : ""}
                </p>
                {t.unlocked && t.prereqMissing.length > 0 ? (
                  <p className="text-xs text-accent">
                    requires: {t.prereqMissing.join(", ")} — earn it first
                  </p>
                ) : null}
              </div>
              {t.unlocked ? (
                <div className="flex shrink-0 items-center gap-3">
                  {t.downloadable ? <KeepButton trackId={t.id} /> : null}
                  <button
                    onClick={() => addToQueue(toQueueTrack(t))}
                    className="text-xs text-text-dim hover:text-gold"
                  >
                    + queue
                  </button>
                </div>
              ) : (
                <Badge tone="sealed">
                  {fill(copy.library.sealed, { level: `level ${t.minAccessLevel}` })}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {unlocked.length > 1 ? (
        <button
          onClick={() => playFrom(filtered, filtered.findIndex((t) => t.unlocked))}
          className="mt-6 rounded-[var(--radius)] bg-accent px-5 py-2.5 text-sm text-text"
        >
          Play all
        </button>
      ) : null}
    </div>
  );
}
