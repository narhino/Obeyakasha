"use client";

import Link from "next/link";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import { toast } from "@/lib/player/toast";
import type { LibraryTrack } from "@/lib/library/queries";
import { isPremiereSealed } from "@/lib/premiere/logic";
import { Button } from "@/components/ui";
import { IconLock, IconPlay } from "@/components/ui/icons";
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
 * The series track list (R4). Plays as a NAMED source so the queue sheet shows
 * "Next from: <series>". Row states mirror the catalog: entitled → play/queue,
 * locked → Upgrade, anonymous → Enter. Every row links to its file page.
 *
 * One exception, matching the catalog grid and the file page exactly (R9.8): a
 * PUBLISHED FREE SAMPLE plays for the unentitled and the logged-out alike. It
 * plays alone — never inside the named series queue, which stays the entitled
 * subject's — so the taste ends into the upsell instead of rolling on into
 * files nobody has earned. Nothing else here loosens.
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
  const playNow = usePlayer((s) => s.playNow);
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
  /** The public taste — one track, on its own, never the series queue (R9.8). */
  function playSample(t: LibraryTrack) {
    playNow([toQueueTrack(t)], 0);
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
          // A published free sample is playable by anyone — unless a premiere
          // still seals it, which seals it for everyone (R9.6).
          const canTaste =
            state !== "entitled" &&
            t.freeSample &&
            !isPremiereSealed(t.premiereAt);
          const sealed = state !== "entitled" && !canTaste;
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

              {state === "entitled" || canTaste ? (
                <button
                  onClick={() =>
                    state === "entitled" ? playFromId(t.id) : playSample(t)
                  }
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
                  className="line-clamp-2 text-sm text-text transition-colors duration-[var(--dur-med)] hover:text-gold"
                >
                  {t.title}
                </Link>
                <p className="text-xs text-text-dim">
                  {formatDuration(t.durationS)}
                  {sealed
                    ? `${formatDuration(t.durationS) ? " · " : ""}${
                        state === "locked"
                          ? fill(copy.library.sealed, { level: `level ${t.minAccessLevel}` })
                          : copy.library.sealedAnon
                      }`
                    : ""}
                  {canTaste ? (
                    <span className="text-gold/90">
                      {formatDuration(t.durationS) ? " · " : ""}
                      {copy.library.sampleChip}
                    </span>
                  ) : null}
                </p>
              </div>

              {state === "entitled" ? (
                <button
                  onClick={() => queueTrack(t)}
                  className="shrink-0 px-1 py-2 text-xs text-text-dim transition-colors hover:text-gold"
                >
                  {copy.library.queue}
                </button>
              ) : canTaste ? null : state === "locked" ? (
                <a href={patreonPageUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  <Button size="sm" variant="primary">
                    {copy.library.unlockCta}
                  </Button>
                </a>
              ) : (
                <Link href="/signin" className="shrink-0">
                  <Button size="sm" variant="primary">
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
