"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import type { MyUpload } from "@/lib/library/queries";
import {
  AUDIO_RE,
  probeDuration,
  uploadAudio,
} from "@/app/sanctum/upload-client";
import { deleteMyUpload } from "@/app/(subject)/library/actions";
import { Button, Cover, Whisper } from "@/components/ui";
import { IconPlay, IconSpark } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format/duration";
import { copy } from "@/copy/copy";

/** Owner-only pipeline chip while a brought file settles. */
function statusLabel(p: MyUpload["pipeline"]): string {
  switch (p) {
    case "uploaded":
      return copy.uploads.status.uploaded;
    case "transcribing":
      return copy.uploads.status.transcribing;
    case "organizing":
      return copy.uploads.status.organizing;
    case "ready":
      return copy.uploads.status.ready;
    default:
      return copy.uploads.status.failed; // failed_transcribe | failed_organize
  }
}

/**
 * F1 — "Yours". The subject's private shelf: a card by the Library search to
 * bring a file of their own, and (once they have any) a cover grid of the ones
 * they brought — each playing through the normal player, showing its pipeline
 * state while it processes, and takeable-back. Everything here is theirs alone.
 */
export function YoursShelf({
  enabled,
  uploads,
}: {
  enabled: boolean;
  uploads: MyUpload[];
}) {
  const router = useRouter();
  const playNow = usePlayer((s) => s.playNow);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (!AUDIO_RE.test(file.name)) {
      setError(copy.uploads.errors.notAudio);
      return;
    }
    setError(null);
    setBusy(true);
    setProgress(0);
    try {
      const durationS = await probeDuration(file);
      await uploadAudio(file, {
        endpoint: "/api/me/upload",
        durationS,
        onProgress: setProgress,
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.uploads.errors.failed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function play(u: MyUpload) {
    const q: QueueTrack = {
      id: u.id,
      title: u.title,
      durationS: u.durationS,
      artworkKey: u.cover,
    };
    playNow([q], 0);
  }

  if (!enabled && uploads.length === 0) return null;

  return (
    <section className="mb-8">
      {enabled ? (
        <div className="mb-6 rounded-[var(--radius-lg)] border border-line/80 bg-surface p-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={open}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base text-text">
                <IconSpark size={16} className="text-gold" />
                {copy.uploads.bring}
              </span>
              <Whisper className="mt-1 text-xs">{copy.uploads.bringLead}</Whisper>
            </span>
            <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-text-dim">
              {open ? copy.uploads.cancel : "＋"}
            </span>
          </button>

          {open ? (
            <div className="mt-4 border-t border-line/70 pt-4">
              <input
                ref={inputRef}
                type="file"
                accept="audio/*"
                disabled={busy}
                onChange={(e) => onPick(e.target.files?.[0])}
                aria-label={copy.uploads.choose}
                className="block w-full text-sm text-text-dim file:mr-3 file:cursor-pointer file:rounded-[var(--radius)] file:border file:border-line file:bg-surface-raised file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-[0.08em] file:text-text hover:file:border-gold/40"
              />
              <Whisper className="mt-2 text-xs">{copy.uploads.chooseHint}</Whisper>
              {busy ? (
                <div className="mt-3">
                  <div className="h-1 overflow-hidden rounded-full bg-line/60">
                    <div
                      className="h-full bg-gold transition-[width] duration-200"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <Whisper className="mt-1.5 text-xs">
                    {copy.uploads.uploading}
                  </Whisper>
                </div>
              ) : null}
              {error ? (
                <p className="mt-2 text-xs text-danger">{error}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {uploads.length > 0 ? (
        <div>
          <p className="label-caps mb-1 text-text-dim/70">
            {copy.uploads.yoursTitle}
          </p>
          <Whisper className="mb-4 text-xs">{copy.uploads.yoursLead}</Whisper>
          <ul className="enter-stagger grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
            {uploads.map((u) => {
              const settled = u.pipeline === "ready";
              return (
                <li key={u.id} className="group flex flex-col">
                  <div className="relative">
                    <Link
                      href={`/library/track/${u.slug}`}
                      aria-label={u.title}
                      className="block"
                    >
                      <Cover src={u.cover} className="aspect-square" />
                    </Link>
                    {u.playable ? (
                      <button
                        onClick={() => play(u)}
                        aria-label={`Play ${u.title}`}
                        className="glow-gold absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-gold text-bg opacity-95 transition-all duration-[var(--dur-med)] hover:bg-gold-deep active:scale-90"
                      >
                        <IconPlay size={17} className="translate-x-[1px]" />
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-2.5 flex min-w-0 flex-col gap-0.5">
                    <Link
                      href={`/library/track/${u.slug}`}
                      className="line-clamp-2 text-sm leading-snug text-text transition-colors duration-[var(--dur-med)] hover:text-gold"
                    >
                      {u.title}
                    </Link>
                    {u.durationS != null ? (
                      <span className="text-xs text-text-dim">
                        {formatDuration(u.durationS)}
                      </span>
                    ) : null}
                    {!settled ? (
                      <span className="text-xs italic text-gold/80">
                        {statusLabel(u.pipeline)}
                      </span>
                    ) : null}
                    <form
                      action={deleteMyUpload}
                      onSubmit={(e) => {
                        if (!confirm(copy.uploads.deleteConfirm))
                          e.preventDefault();
                      }}
                      className="mt-1.5"
                    >
                      <input type="hidden" name="trackId" value={u.id} />
                      <button
                        type="submit"
                        className="text-xs text-text-dim transition-colors duration-[var(--dur-med)] hover:text-danger"
                      >
                        {copy.uploads.delete}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
