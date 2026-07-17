"use client";

import Link from "next/link";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import { toast } from "@/lib/player/toast";
import type { LibraryTrack } from "@/lib/library/queries";
import { Button } from "@/components/ui";
import { IconLock, IconPlay } from "@/components/ui/icons";
import { KeepButton } from "@/components/offline/KeepButton";
import { formatDuration } from "@/lib/format/duration";
import { copy, fill } from "@/copy/copy";

type CardTrack = LibraryTrack & { matchedOnlyTranscript?: boolean };

function toQueueTrack(t: LibraryTrack): QueueTrack {
  return {
    id: t.id,
    title: t.title,
    durationS: t.durationS,
    artworkKey: t.artworkKey,
  };
}

/**
 * The catalog list (R2a). Three card states per track:
 *  - entitled (signed-in, level allows): Play + queue;
 *  - locked (signed-in, level too low): sealed veil + Upgrade → Patreon;
 *  - anonymous: sealed veil + Enter with Patreon → /signin.
 * Titles/artwork are never hidden. Reused by the catalog page and the series
 * stub page.
 */
export function LibraryClient({
  tracks,
  signedIn,
  patreonPageUrl,
  fallback = null,
}: {
  tracks: CardTrack[];
  signedIn: boolean;
  patreonPageUrl: string;
  fallback?: "related" | "popular" | null;
}) {
  const playNow = usePlayer((s) => s.playNow);
  const addToQueue = usePlayer((s) => s.addToQueue);

  function queueTrack(t: LibraryTrack) {
    addToQueue(toQueueTrack(t));
    toast(fill(copy.player.queue.queued, { title: t.title }));
  }

  const entitled = tracks.filter((t) => signedIn && t.unlocked);

  function playFrom(index: number) {
    const startId = tracks[index]?.id;
    const queue = tracks
      .filter((t) => signedIn && t.unlocked)
      .map(toQueueTrack);
    const startIndex = queue.findIndex((q) => q.id === startId);
    if (startIndex >= 0) playNow(queue, startIndex);
  }

  return (
    <div>
      {fallback ? (
        <p className="mb-4 font-[family-name:var(--font-display)] text-base italic text-text-dim">
          {copy.library.nothingExact}
        </p>
      ) : null}

      {tracks.length === 0 ? (
        <p className="text-sm text-text-dim">{copy.library.empty}</p>
      ) : (
        // Two-up on wide screens so the catalog fills the gutters (F34).
        <ul className="grid gap-2 lg:grid-cols-2">
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
                className={`flex items-center gap-3 rounded-[var(--radius-lg)] border p-3 ${
                  sealed
                    ? "border-accent/20 bg-accent-soft/40"
                    : "border-line bg-surface"
                }`}
              >
                {state === "entitled" ? (
                  <button
                    onClick={() => playFrom(i)}
                    aria-label={`Play ${t.title}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep"
                  >
                    <IconPlay size={16} />
                  </button>
                ) : (
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-text-dim/70"
                  >
                    <IconLock size={16} />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-text">
                    {t.title}
                    {t.madeForYou ? (
                      <span className="ml-2 text-xs text-gold">
                        {copy.library.madeForYou}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-text-dim">
                    {formatDuration(t.durationS)}
                    {t.tags.length > 0
                      ? " · " +
                        t.tags
                          .slice(0, 2)
                          .map((tag) => tag.value)
                          .join(", ")
                      : ""}
                  </p>
                  {t.matchedOnlyTranscript ? (
                    <p className="mt-0.5 text-xs italic text-gold/80">
                      {copy.library.spokenMatch}
                    </p>
                  ) : null}
                  {sealed ? (
                    <p className="mt-0.5 text-xs text-text-dim/80">
                      {state === "locked"
                        ? fill(copy.library.sealed, {
                            level: `level ${t.minAccessLevel}`,
                          })
                        : copy.library.sealedAnon}
                    </p>
                  ) : null}
                  {state === "entitled" && t.prereqMissing.length > 0 ? (
                    <p className="text-xs text-accent">
                      {fill(copy.library.sealedByPrereq, {
                        track: t.prereqMissing.join(", "),
                      })}
                    </p>
                  ) : null}
                  <Link
                    href={`/library/track/${t.slug}`}
                    className="mt-0.5 inline-block py-1 text-xs text-text-dim transition-colors duration-[var(--dur-med)] hover:text-gold"
                  >
                    {copy.library.filePage.cardLink}
                  </Link>
                </div>

                {state === "entitled" ? (
                  <div className="flex shrink-0 items-center gap-3">
                    {t.downloadable ? <KeepButton trackId={t.id} /> : null}
                    <button
                      onClick={() => queueTrack(t)}
                      className="px-1 py-2 text-xs text-text-dim hover:text-gold"
                    >
                      {copy.library.queue}
                    </button>
                  </div>
                ) : state === "locked" ? (
                  <a
                    href={patreonPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0"
                  >
                    {/* Wine, not gold — a locked row is a secondary CTA; the
                        page keeps a single gold (the header Enter) (F16). */}
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
        </ul>
      )}

      {signedIn && entitled.length > 1 ? (
        <button
          onClick={() => {
            const first = tracks.findIndex((t) => t.unlocked);
            if (first >= 0) playFrom(first);
          }}
          className="mt-6 rounded-[var(--radius)] bg-accent px-5 py-2.5 text-sm text-text"
        >
          {copy.library.playAll}
        </button>
      ) : null}
    </div>
  );
}
