"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { SubjectGroup } from "./page";
import { deleteTheirFile } from "./actions";
import { Badge, Card } from "@/components/ui";
import { IconPause, IconPlay } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format/duration";

export interface TheirFileRow {
  trackId: string;
  title: string;
  durationS: number | null;
  sizeBytes: number | null;
  pipeline:
    | "uploaded"
    | "transcribing"
    | "organizing"
    | "ready"
    | "failed_transcribe"
    | "failed_organize";
  playable: boolean;
  transcriptStatus: "none" | "queued" | "processing" | "done" | "failed";
}

const PIPELINE_LABEL: Record<TheirFileRow["pipeline"], string> = {
  uploaded: "settling",
  transcribing: "transcribing…",
  organizing: "organizing…",
  ready: "ready",
  failed_transcribe: "transcribe failed",
  failed_organize: "organize failed",
};

function mb(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TheirFilesClient({
  groups,
  totalFiles,
}: {
  groups: SubjectGroup[];
  totalFiles: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function toggle(trackId: string) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === trackId) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    setLoadingId(trackId);
    try {
      // The goddess streams via the normal gate — it mints her a signed URL for
      // a personal upload (isGoddess); no raw storage key is ever exposed.
      const res = await fetch(`/api/tracks/${trackId}/stream-url`);
      if (!res.ok) throw new Error("sealed");
      const { url } = (await res.json()) as { url: string };
      audio.src = url;
      await audio.play();
      setPlayingId(trackId);
    } catch {
      setPlayingId(null);
    } finally {
      setLoadingId(null);
    }
  }

  if (totalFiles === 0) {
    return (
      <Card className="mt-6">
        <p className="text-sm text-text-dim">
          No one has brought you anything of theirs yet.
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        className="hidden"
      />
      {groups.map((g) => (
        <Card key={g.userId} id={`u-${g.userId}`} raised className="scroll-mt-24">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            {/* Whose files these are opens who they are. */}
            <Link
              href={`/sanctum/subjects/${g.userId}`}
              className="font-[family-name:var(--font-display)] text-lg text-text transition-colors hover:text-gold"
            >
              {g.name}
            </Link>
            <p className="nums-lining text-xs text-text-dim">
              {g.files.length} {g.files.length === 1 ? "file" : "files"} ·{" "}
              {mb(g.totalBytes)}
            </p>
          </div>

          <ul className="divide-y divide-line/60">
            {g.files.map((f) => (
              <li
                key={f.trackId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => toggle(f.trackId)}
                  disabled={!f.playable || loadingId === f.trackId}
                  aria-label={playingId === f.trackId ? "Pause" : `Play ${f.title}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 text-gold transition-colors hover:bg-gold/10 disabled:opacity-40"
                >
                  {playingId === f.trackId ? (
                    <IconPause size={14} />
                  ) : (
                    <IconPlay size={14} className="translate-x-[1px]" />
                  )}
                </button>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">
                    {f.title}
                  </span>
                  <span className="text-xs text-text-dim">
                    {f.durationS != null ? formatDuration(f.durationS) : "—"} ·{" "}
                    {mb(f.sizeBytes)}
                  </span>
                </span>

                <Badge tone={f.pipeline === "ready" ? "gold" : "sealed"}>
                  {PIPELINE_LABEL[f.pipeline]}
                </Badge>

                <Link
                  href={`/sanctum/tracks/${f.trackId}`}
                  className="text-xs uppercase tracking-[0.12em] text-text-dim transition-colors hover:text-gold"
                >
                  {f.transcriptStatus === "done" ? "Transcript" : "Dossier"}
                </Link>

                <form
                  action={deleteTheirFile}
                  onSubmit={(e) => {
                    if (
                      !confirm(
                        "Remove this file? Its audio and everything derived from it is deleted for good.",
                      )
                    )
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="trackId" value={f.trackId} />
                  <button
                    type="submit"
                    className="text-xs uppercase tracking-[0.12em] text-text-dim transition-colors hover:text-danger"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
