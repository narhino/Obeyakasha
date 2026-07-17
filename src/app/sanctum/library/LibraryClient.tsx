"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Input, Whisper } from "@/components/ui";
import { UploadQueue } from "./UploadQueue";
import { usePolling } from "@/lib/hooks/usePolling";
import type { LibraryRow } from "./types";
import {
  requestTranscription,
  setTrackVisibility,
  updateTrackMeta,
} from "./actions";
import { organizeTrackAction } from "../organize/actions";

function fmtDuration(s: number | null): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const TRANSCRIPT_WORKING = new Set(["queued", "processing"]);
const PIPELINE_WORKING = new Set(["transcribing", "organizing"]);

function isWorking(t: LibraryRow): boolean {
  return (
    PIPELINE_WORKING.has(t.pipeline) ||
    TRANSCRIPT_WORKING.has(t.transcriptStatus)
  );
}

function PipelineBadge({ row }: { row: LibraryRow }) {
  switch (row.pipeline) {
    case "transcribing":
      return <Badge tone="neutral">transcribing…</Badge>;
    case "organizing":
      return <Badge tone="neutral">organizing…</Badge>;
    case "failed_transcribe":
      return <Badge tone="danger">transcribe failed</Badge>;
    case "failed_organize":
      return <Badge tone="danger">organize failed</Badge>;
    case "ready":
      // Positive states read calm/gold; wine is reserved for failures (F29).
      return row.transcriptStatus === "done" ? (
        <Badge tone="gold">script ready</Badge>
      ) : (
        <Badge tone="neutral">ready</Badge>
      );
    default:
      return <Badge tone="neutral">uploaded</Badge>;
  }
}

export function LibraryClient({ initial }: { initial: LibraryRow[] }) {
  const [tracks, setTracks] = useState<LibraryRow[]>(initial);
  const [uploadsActive, setUploadsActive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/sanctum/tracks", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { tracks: LibraryRow[] };
      setTracks(data.tracks);
    } catch {
      /* transient; next poll retries */
    }
  }, []);

  const anyWorking = useMemo(() => tracks.some(isWorking), [tracks]);
  usePolling(() => void refetch(), uploadsActive || anyWorking ? 2500 : 15000);

  const patch = (id: string, next: Partial<LibraryRow>) =>
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...next } : t)));

  const run = (id: string, fd: FormData, action: (f: FormData) => Promise<void>) => {
    setBusyId(id);
    startTransition(async () => {
      try {
        await action(fd);
        await refetch();
      } finally {
        setBusyId(null);
      }
    });
  };

  const onTranscribe = (id: string) => {
    patch(id, { transcriptStatus: "queued" }); // optimistic
    const fd = new FormData();
    fd.set("trackId", id);
    run(id, fd, requestTranscription);
  };

  const onOrganize = (id: string) => {
    const fd = new FormData();
    fd.set("trackId", id);
    run(id, fd, organizeTrackAction);
  };

  const onVisibility = (id: string, visibility: "published" | "draft") => {
    patch(id, { visibility }); // optimistic
    const fd = new FormData();
    fd.set("trackId", id);
    fd.set("visibility", visibility);
    run(id, fd, setTrackVisibility);
  };

  return (
    <div>
      <Card className="mt-6">
        <Whisper className="mb-3">Add to the library</Whisper>
        <UploadQueue onUploaded={() => void refetch()} onActiveChange={setUploadsActive} />
      </Card>

      <div className="mt-6 space-y-3">
        {tracks.length === 0 ? (
          <Card>
            <Whisper>Nothing here yet. Drop your first audio above.</Whisper>
          </Card>
        ) : (
          tracks.map((t) => (
            <Card key={t.id} raised>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-[family-name:var(--font-display)] text-lg">
                    {t.title}
                  </p>
                  <Whisper className="text-xs">
                    {fmtDuration(t.durationS)} · level {t.minAccessLevel} ·{" "}
                    {t.hasAudio ? "audio ready" : "no audio"} · {t.tagCount} tag
                    {t.tagCount === 1 ? "" : "s"}
                  </Whisper>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge
                    tone={
                      t.visibility === "published"
                        ? "gold"
                        : t.visibility === "archived"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {t.visibility}
                  </Badge>
                  <PipelineBadge row={t} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {t.visibility !== "published" ? (
                  <Button
                    size="sm"
                    variant="gold"
                    loading={busyId === t.id}
                    disabled={!t.hasAudio || busyId === t.id}
                    onClick={() => onVisibility(t.id, "published")}
                  >
                    Publish
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busyId === t.id}
                    disabled={busyId === t.id}
                    onClick={() => onVisibility(t.id, "draft")}
                  >
                    Unpublish
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyId === t.id && !isWorking(t)}
                  disabled={!t.hasAudio || busyId === t.id || isWorking(t)}
                  onClick={() => onTranscribe(t.id)}
                >
                  {t.transcriptStatus === "done" ? "Re-transcribe" : "Transcribe"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyId === t.id}
                  disabled={busyId === t.id}
                  onClick={() => onOrganize(t.id)}
                >
                  Organize
                </Button>
                <a
                  href={`/sanctum/tracks/${t.id}`}
                  className="inline-flex items-center rounded-[var(--radius)] border border-line px-3.5 py-1.5 text-[0.8125rem] uppercase tracking-[0.08em] text-text-dim transition-colors hover:border-text-dim/60 hover:text-text"
                >
                  Open
                </a>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-text-dim hover:text-text">
                  Edit details
                </summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    fd.set("trackId", t.id);
                    run(t.id, fd, updateTrackMeta);
                  }}
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                >
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Title
                    <Input name="title" defaultValue={t.title} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Access level
                    <Input
                      name="minAccessLevel"
                      type="number"
                      min={0}
                      max={99}
                      defaultValue={t.minAccessLevel}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-dim">
                    Duration (s)
                    <Input
                      name="durationS"
                      type="number"
                      min={0}
                      defaultValue={t.durationS ?? ""}
                    />
                  </label>
                  <label className="flex items-center gap-2 self-end text-xs text-text-dim">
                    <input
                      type="checkbox"
                      name="downloadable"
                      defaultChecked={t.downloadable}
                    />
                    Downloadable
                  </label>
                  <label className="col-span-full flex flex-col gap-1 text-xs text-text-dim">
                    Description
                    <textarea
                      name="description"
                      defaultValue={t.description ?? ""}
                      rows={2}
                      className="rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-text focus:border-gold focus:outline-none"
                    />
                  </label>
                  <div className="col-span-full">
                    <Button type="submit" size="sm" disabled={busyId === t.id}>
                      Save
                    </Button>
                  </div>
                </form>
              </details>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
