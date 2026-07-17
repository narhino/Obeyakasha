"use client";

import Link from "next/link";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import { toast } from "@/lib/player/toast";
import type { LibraryTrack } from "@/lib/library/queries";
import { Button } from "@/components/ui";
import { IconLock, IconPlay } from "@/components/ui/icons";
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

/**
 * The series track list (R4). Plays as a NAMED source so the queue sheet shows
 * "Next from: <series>". Row states mirror the catalog: entitled → play/queue,
 * locked → Upgrade, anonymous → Enter. Every row links to its file page.
 */
export function SeriesClient({
  tracks,
  seriesTitle,
  signedIn,
  patreonPageUrl,
}: {
  tracks: LibraryTrack[];
  seriesTitle: string;
  signedIn: boolean;
  patreonPageUrl: string;
}) {
  const playSource = usePlayer((s) => s.playSource);
  const addToQueue = usePlayer((s) => s.addToQueue);

  const entitled = tracks.filter((t) => signedIn && t.unlocked);
  const queue = entitled.map(toQueueTrack);

  function playFromId(id: string) {
    const startIndex = queue.findIndex((q) => q.id === id);
    if (startIndex >= 0) playSource(queue, seriesTitle, startIndex);
  }
  function playAll() {
    if (queue.length > 0) playSource(queue, seriesTitle, 0);
  }
  function queueTrack(t: LibraryTrack) {
    addToQueue(toQueueTrack(t));
    toast(fill(copy.player.queue.queued, { title: t.title }));
  }

  if (tracks.length === 0) {
    return <p className="text-sm text-text-dim">{copy.library.empty}</p>;
  }

  return (
    <div>
      {signedIn && entitled.length > 0 ? (
        <button
          onClick={playAll}
          className="mb-5 inline-flex items-center gap-2.5 rounded-[var(--radius)] bg-gold px-6 py-3 text-sm font-medium uppercase tracking-[0.08em] text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep"
        >
          <IconPlay size={17} />
          {copy.library.playAll}
        </button>
      ) : null}

      <ol className="space-y-1">
        {tracks.map((t, i) => {
          const state: "entitled" | "locked" | "anon" = !signedIn
            ? "anon"
            : t.unlocked
              ? "entitled"
              : "locked";
          const sealed = state !== "entitled";
          return (
            <li
              key={t.id}
              className={`flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2.5 ${
                sealed ? "border-accent/20 bg-accent-soft/30" : "border-line bg-surface"
              }`}
            >
              <span className="w-5 shrink-0 text-center text-xs tabular-nums text-text-dim/70">
                {i + 1}
              </span>

              {state === "entitled" ? (
                <button
                  onClick={() => playFromId(t.id)}
                  aria-label={`Play ${t.title}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep"
                >
                  <IconPlay size={15} />
                </button>
              ) : (
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-text-dim/70"
                >
                  <IconLock size={15} />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <Link
                  href={`/library/track/${t.slug}`}
                  className="block truncate text-sm text-text transition-colors duration-[var(--dur-med)] hover:text-gold"
                >
                  {t.title}
                </Link>
                <p className="text-xs text-text-dim">
                  {fmt(t.durationS)}
                  {sealed
                    ? `${fmt(t.durationS) ? " · " : ""}${
                        state === "locked"
                          ? fill(copy.library.sealed, { level: `level ${t.minAccessLevel}` })
                          : copy.library.sealedAnon
                      }`
                    : ""}
                </p>
              </div>

              {state === "entitled" ? (
                <button
                  onClick={() => queueTrack(t)}
                  className="shrink-0 text-xs text-text-dim transition-colors hover:text-gold"
                >
                  {copy.library.queue}
                </button>
              ) : state === "locked" ? (
                <a href={patreonPageUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  <Button size="sm" variant="gold">
                    {copy.library.unlockCta}
                  </Button>
                </a>
              ) : (
                <Link href="/signin" className="shrink-0">
                  <Button size="sm" variant="gold">
                    {copy.auth.signInButton}
                  </Button>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
