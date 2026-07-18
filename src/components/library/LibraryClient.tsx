"use client";

import Link from "next/link";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import { toast } from "@/lib/player/toast";
import type { LibraryTrack } from "@/lib/library/queries";
import { EMPTY_IMAGE } from "@/lib/art/defaults";
import { isPremiereSealed } from "@/lib/premiere/logic";
import { Button, Cover, EmptyState } from "@/components/ui";
import { IconLock, IconPlay, IconSpark } from "@/components/ui/icons";
import { KeepButton } from "@/components/offline/KeepButton";
import { formatDuration } from "@/lib/format/duration";
import { formatUntil } from "@/lib/format/when";
import { copy, fill } from "@/copy/copy";

type CardTrack = LibraryTrack & { matchedOnlyTranscript?: boolean };

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
 * The catalog — a record-shop cover grid (D5). Every track is its bespoke cover
 * (1:1), title below, small meta; the state lives on the art:
 *  - entitled / free sample: a gold Play floats on the cover;
 *  - sealed (level too low, or logged-out): the cover dims under a gold seal,
 *    the reason kept in words below (copy unchanged);
 *  - premiere: a gold spark + glowing countdown, sealed from play for everyone.
 * Titles + artwork are never hidden. Reused by the catalog + series stub page.
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

  // A premiere-sealed track is entitled but not yet playable — it never joins
  // any play queue (R9.6).
  const playable = (t: LibraryTrack) =>
    signedIn && t.unlocked && !isPremiereSealed(t.premiereAt);
  const entitled = tracks.filter(playable);

  function playFrom(index: number) {
    const startId = tracks[index]?.id;
    const queue = tracks.filter(playable).map(toQueueTrack);
    const startIndex = queue.findIndex((q) => q.id === startId);
    if (startIndex >= 0) playNow(queue, startIndex);
  }

  // A published free sample plays on its own for the unentitled/logged-out —
  // the public taste (R9.8). Never joins the entitled play-all queue.
  function playSample(t: LibraryTrack) {
    playNow([toQueueTrack(t)], 0);
  }

  if (tracks.length === 0) {
    return (
      <EmptyState image={EMPTY_IMAGE} className="mt-10">
        {copy.library.empty}
      </EmptyState>
    );
  }

  return (
    <div>
      {fallback ? (
        <p className="mb-5 font-[family-name:var(--font-display)] text-base italic text-text-dim">
          {copy.library.nothingExact}
        </p>
      ) : null}

      <ul className="enter-stagger grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
        {tracks.map((t, i) => {
          const state: "entitled" | "locked" | "anon" = !signedIn
            ? "anon"
            : t.unlocked
              ? "entitled"
              : "locked";
          const premiereSealed = isPremiereSealed(t.premiereAt);
          const canPlay =
            !premiereSealed && (state === "entitled" || t.freeSample);
          const sealed =
            state !== "entitled" && !t.freeSample && !premiereSealed;
          const metaTags =
            t.tags.length > 0
              ? t.tags
                  .slice(0, 2)
                  .map((tag) => tag.value)
                  .join(", ")
              : "";
          const duration = formatDuration(t.durationS);

          return (
            <li key={t.id} className="group flex flex-col">
              <div className="relative">
                <Link
                  href={`/library/track/${t.slug}`}
                  aria-label={t.title}
                  className="block"
                >
                  <Cover
                    src={t.cover}
                    dimmed={sealed}
                    className="aspect-square"
                  />
                </Link>

                {/* On-cover badges (top-left) */}
                {premiereSealed ? (
                  <span className="absolute left-2 top-2 rounded-[var(--radius-sm)] border border-gold/40 bg-bg/70 px-1.5 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] text-gold backdrop-blur-sm">
                    {copy.library.premiere.chip}
                  </span>
                ) : t.freeSample && state !== "entitled" ? (
                  <span className="absolute left-2 top-2 rounded-[var(--radius-sm)] border border-gold/30 bg-bg/70 px-1.5 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] text-gold backdrop-blur-sm">
                    {copy.library.sampleChip}
                  </span>
                ) : null}
                {t.madeForYou ? (
                  <span className="absolute right-2 top-2 rounded-[var(--radius-sm)] border border-gold/30 bg-bg/70 px-1.5 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] text-gold backdrop-blur-sm">
                    {copy.library.madeForYou}
                  </span>
                ) : null}

                {/* Play / seal */}
                {canPlay ? (
                  <button
                    onClick={() =>
                      state === "entitled" ? playFrom(i) : playSample(t)
                    }
                    aria-label={`Play ${t.title}`}
                    className="glow-gold absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-gold text-bg opacity-95 transition-all duration-[var(--dur-med)] hover:bg-gold-deep active:scale-90"
                  >
                    <IconPlay size={17} className="translate-x-[1px]" />
                  </button>
                ) : premiereSealed ? (
                  <span
                    aria-hidden
                    className="glow-gold absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-bg/70 text-gold backdrop-blur-sm"
                  >
                    <IconSpark size={16} />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  >
                    <span className="glow-gold flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-bg/60 text-gold/90 backdrop-blur-sm">
                      <IconLock size={18} />
                    </span>
                  </span>
                )}
              </div>

              {/* Identity + meta */}
              <div className="mt-2.5 flex min-w-0 flex-col gap-0.5">
                <Link
                  href={`/library/track/${t.slug}`}
                  className="line-clamp-2 text-sm leading-snug text-text transition-colors duration-[var(--dur-med)] hover:text-gold"
                >
                  {t.title}
                </Link>
                {duration || metaTags ? (
                  <span className="text-xs text-text-dim">
                    {duration}
                    {duration && metaTags ? " · " : ""}
                    {metaTags}
                  </span>
                ) : null}

                {premiereSealed ? (
                  <span className="text-xs italic text-gold/90">
                    {fill(copy.library.premiere.countdown, {
                      when: formatUntil(t.premiereAt),
                    })}
                  </span>
                ) : null}
                {t.matchedOnlyTranscript ? (
                  <span className="text-xs italic text-gold/80">
                    {copy.library.spokenMatch}
                  </span>
                ) : null}
                {sealed ? (
                  <span className="text-xs text-text-dim/80">
                    {state === "locked"
                      ? fill(copy.library.sealed, {
                          level: `level ${t.minAccessLevel}`,
                        })
                      : copy.library.sealedAnon}
                  </span>
                ) : null}
                {!premiereSealed &&
                state === "entitled" &&
                t.prereqMissing.length > 0 ? (
                  <span className="text-xs text-accent">
                    {fill(copy.library.sealedByPrereq, {
                      track: t.prereqMissing.join(", "),
                    })}
                  </span>
                ) : null}

                {/* Actions */}
                {premiereSealed ? null : state === "entitled" ? (
                  <div className="mt-1.5 flex items-center gap-3">
                    {t.downloadable ? <KeepButton trackId={t.id} /> : null}
                    <button
                      onClick={() => queueTrack(t)}
                      className="text-xs text-text-dim transition-colors duration-[var(--dur-med)] hover:text-gold"
                    >
                      {copy.library.queue}
                    </button>
                  </div>
                ) : t.freeSample ? null : state === "locked" ? (
                  <a
                    href={patreonPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block"
                  >
                    <Button size="sm" variant="primary">
                      {copy.library.unlockCta}
                    </Button>
                  </a>
                ) : (
                  <Link href="/signin" className="mt-1.5 inline-block">
                    <Button size="sm" variant="primary">
                      {copy.auth.signInShort}
                    </Button>
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {signedIn && entitled.length > 1 ? (
        <button
          onClick={() => {
            const first = tracks.findIndex((t) => t.unlocked);
            if (first >= 0) playFrom(first);
          }}
          className="mt-8 inline-flex items-center gap-2.5 rounded-[var(--radius)] bg-accent px-5 py-2.5 text-sm uppercase tracking-[0.08em] text-text transition-colors duration-[var(--dur-med)] hover:bg-accent/85"
        >
          <IconPlay size={15} />
          {copy.library.playAll}
        </button>
      ) : null}
    </div>
  );
}
