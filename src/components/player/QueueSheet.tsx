"use client";

import { useRef, useState } from "react";
import { usePlayer, type QueueKind, type QueueTrack } from "@/lib/player/store";
import { formatDuration } from "@/lib/format/duration";
import { copy, fill } from "@/copy/copy";
import { IconChevronDown, IconSeal } from "@/components/ui/icons";

/** Row artwork tile — the enqueue payload carries a resolved, renderable cover
 *  URL (D1), never a raw key, so we show the real cover; the 888 sigil is the
 *  fallback (breathing while now-playing, steady under reduced-motion). */
function ArtTile({
  src = null,
  pulsing = false,
}: {
  src?: string | null;
  pulsing?: boolean;
}) {
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius)] border border-line/70 bg-accent-soft/40 text-gold/80"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <IconSeal size={18} className={pulsing ? "breathe" : undefined} />
      )}
    </span>
  );
}

function Row({
  track,
  which,
  index,
  count,
}: {
  track: QueueTrack;
  which: QueueKind;
  index: number;
  count: number;
}) {
  const jumpTo = usePlayer((s) => s.jumpTo);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const reorderManual = usePlayer((s) => s.reorderManual);

  return (
    <li className="flex items-center gap-3 rounded-[var(--radius)] px-2 py-1.5 transition-colors duration-[var(--dur-med)] hover:bg-surface-raised/60">
      <button
        onClick={() => jumpTo(track.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={copy.player.queue.jump}
      >
        <ArtTile src={track.artworkKey} />
        <span className="min-w-0">
          <span className="line-clamp-2 text-sm leading-snug text-text">{track.title}</span>
          {formatDuration(track.durationS) ? (
            <span className="block text-xs text-text-dim">
              {formatDuration(track.durationS)}
            </span>
          ) : null}
        </span>
      </button>

      {/* Comfortable ≥44px-tall tap targets, not the old 28px squares (F25). */}
      <div className="flex shrink-0 items-center gap-0.5">
        {which === "manual" ? (
          <>
            <button
              onClick={() => reorderManual(index, index - 1)}
              disabled={index === 0}
              aria-label={copy.player.queue.up}
              className="flex h-11 w-9 items-center justify-center rounded-[var(--radius-sm)] text-text-dim transition-colors hover:text-gold disabled:opacity-25"
            >
              <IconChevronDown size={16} className="rotate-180" />
            </button>
            <button
              onClick={() => reorderManual(index, index + 1)}
              disabled={index === count - 1}
              aria-label={copy.player.queue.down}
              className="flex h-11 w-9 items-center justify-center rounded-[var(--radius-sm)] text-text-dim transition-colors hover:text-gold disabled:opacity-25"
            >
              <IconChevronDown size={16} />
            </button>
          </>
        ) : null}
        <button
          onClick={() => removeFromQueue(track.id, which)}
          aria-label={copy.player.queue.remove}
          className="flex h-11 w-9 items-center justify-center rounded-[var(--radius-sm)] text-lg leading-none text-text-dim transition-colors hover:text-danger"
        >
          &times;
        </button>
      </div>
    </li>
  );
}

/**
 * The queue sheet (R4/P1), modelled on Spotify. A bottom sheet opened from the
 * mini-player and fullscreen; scrim-tap or drag-down to dismiss. Shows the
 * pinned Now row, the manual "Next in queue", and the "Next from: <source>"
 * remainder. Reorder/remove/jump all act on the store.
 */
export function QueueSheet() {
  const open = usePlayer((s) => s.queueOpen);
  const setQueueOpen = usePlayer((s) => s.setQueueOpen);
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const manualQueue = usePlayer((s) => s.manualQueue);
  const sourceQueue = usePlayer((s) => s.sourceQueue);
  const sourceIndex = usePlayer((s) => s.sourceIndex);
  const sourceName = usePlayer((s) => s.sourceName);
  const clearManual = usePlayer((s) => s.clearManual);

  const startYRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  if (!open) return null;

  const upcomingSource = sourceQueue.slice(sourceIndex + 1);
  const nothingWaits = manualQueue.length === 0 && upcomingSource.length === 0;

  function close() {
    setDragY(0);
    setQueueOpen(false);
  }

  function onHandleDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
  }
  function onHandleMove(e: React.PointerEvent<HTMLDivElement>) {
    if (startYRef.current == null) return;
    setDragY(Math.max(0, e.clientY - startYRef.current));
  }
  function onHandleUp(e: React.PointerEvent<HTMLDivElement>) {
    if (startYRef.current == null) return;
    const dy = Math.max(0, e.clientY - startYRef.current);
    startYRef.current = null;
    if (dy > 90) close();
    else setDragY(0);
  }

  return (
    <div className="fixed inset-0 z-[65]">
      {/* scrim */}
      <button
        onClick={close}
        aria-label={copy.player.controls.minimize}
        className="absolute inset-0 h-full w-full cursor-default bg-bg/70 backdrop-blur-sm"
      />
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col rounded-t-[var(--radius-lg)] border-t border-line/70 bg-surface shadow-[0_-24px_80px_rgba(0,0,0,0.6)]"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY ? "none" : "transform var(--dur-med) var(--ease-trance)",
        }}
      >
        {/* drag handle / header */}
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="shrink-0 cursor-grab touch-none px-4 pt-3 pb-1 active:cursor-grabbing"
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-line" aria-hidden />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {/* Now */}
          {current ? (
            <div className="mb-4">
              <p className="label-caps mb-2 text-gold/80">{copy.player.queue.now}</p>
              <div className="flex items-center gap-3 rounded-[var(--radius)] border border-gold/20 bg-accent-soft/25 px-2 py-2">
                <ArtTile src={current.artworkKey} pulsing={playing} />
                <span className="min-w-0">
                  <span className="line-clamp-2 font-[family-name:var(--font-display)] text-[0.95rem] leading-snug text-text">
                    {current.title}
                  </span>
                  {formatDuration(current.durationS) ? (
                    <span className="block text-xs text-text-dim">
                      {formatDuration(current.durationS)}
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          ) : null}

          {nothingWaits ? (
            <p className="py-10 text-center font-[family-name:var(--font-display)] text-base italic text-text-dim">
              {copy.player.queue.empty}
            </p>
          ) : null}

          {/* Next in queue (manual) */}
          {manualQueue.length > 0 ? (
            <div className="mb-5">
              <div className="mb-1 flex items-center justify-between">
                <p className="label-caps text-text-dim/70">
                  {copy.player.queue.nextManual}
                </p>
                <button
                  onClick={clearManual}
                  className="text-[0.6875rem] tracking-[0.1em] uppercase text-text-dim transition-colors hover:text-danger"
                >
                  {copy.player.queue.clear}
                </button>
              </div>
              <ul>
                {manualQueue.map((track, i) => (
                  <Row
                    key={`m-${track.id}-${i}`}
                    track={track}
                    which="manual"
                    index={i}
                    count={manualQueue.length}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {/* Next from: <source> */}
          {upcomingSource.length > 0 ? (
            <div className="mb-3">
              <p className="label-caps mb-1 text-text-dim/70">
                {sourceName
                  ? fill(copy.player.queue.nextFrom, { source: sourceName })
                  : copy.player.queue.upNext}
              </p>
              <ul>
                {upcomingSource.map((track, i) => (
                  <Row
                    key={`s-${track.id}-${i}`}
                    track={track}
                    which="source"
                    index={i}
                    count={upcomingSource.length}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
