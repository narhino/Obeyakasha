"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Input, Whisper } from "@/components/ui";
import { UploadQueue } from "./UploadQueue";
import { ConfirmDelete } from "../ConfirmDelete";
import { usePolling } from "@/lib/hooks/usePolling";
import { copy } from "@/copy/copy";
import type { LibraryRow } from "./types";
import {
  deleteTrack,
  requestTranscription,
  setFreeSample,
  setTrackVisibility,
  transcribeAllPending,
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
      // "script ready" now means a real transcript WITH TEXT exists — never a
      // bare "done" status (old stub rows are done-but-empty). No text on a
      // ready track = an honest wine "no script" she can re-run.
      if (row.hasScript) return <Badge tone="gold">script ready</Badge>;
      if (row.transcriptStatus === "failed" || row.transcriptStatus === "done")
        return <Badge tone="danger">no script</Badge>;
      return <Badge tone="neutral">ready</Badge>;
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

  // Tracks that have audio but no finished script yet — the "transcribe all"
  // target. Excludes ones already in flight so the count reflects real work left.
  const needScript = useMemo(
    () =>
      tracks.filter(
        (t) =>
          t.hasAudio &&
          !t.hasScript &&
          !TRANSCRIPT_WORKING.has(t.transcriptStatus),
      ).length,
    [tracks],
  );
  const [allBusy, setAllBusy] = useState(false);

  const onTranscribeAll = () => {
    setAllBusy(true);
    startTransition(async () => {
      try {
        await transcribeAllPending();
        await refetch();
      } finally {
        setAllBusy(false);
      }
    });
  };

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

  const onFreeSample = (id: string, freeSample: boolean) => {
    patch(id, { freeSample }); // optimistic
    const fd = new FormData();
    fd.set("trackId", id);
    fd.set("freeSample", String(freeSample));
    run(id, fd, setFreeSample);
  };

  // deleteTrack has already resolved when this fires (ConfirmDelete awaits it):
  // drop the row optimistically, then reconcile against the server feed.
  const onDeleted = (id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
    void refetch();
  };

  return (
    <div>
      <Card className="mt-6">
        <Whisper className="mb-3">Add to the library</Whisper>
        <UploadQueue onUploaded={() => void refetch()} onActiveChange={setUploadsActive} />
      </Card>

      {/* One-tap: transcribe everything that still needs a script. The worker
          grinds through them one at a time and retries transient failures. */}
      {needScript > 0 ? (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Whisper className="text-sm">
            {needScript} {needScript === 1 ? "track needs" : "tracks need"} a
            script.{" "}
            {anyWorking ? (
              <span className="text-gold/80">Working through them…</span>
            ) : (
              "Set them all going at once — they run one by one."
            )}
          </Whisper>
          <Button
            size="sm"
            variant="gold"
            onClick={onTranscribeAll}
            disabled={allBusy}
          >
            {allBusy ? "Setting them going…" : `Transcribe all (${needScript})`}
          </Button>
        </Card>
      ) : null}

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
                  {t.hasScript ? "Re-transcribe" : "Transcribe"}
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
                <Button
                  size="sm"
                  variant={t.freeSample ? "gold" : "ghost"}
                  loading={busyId === t.id}
                  disabled={busyId === t.id}
                  onClick={() => onFreeSample(t.id, !t.freeSample)}
                  title="A published free sample streams to anyone — logged-out included."
                >
                  {t.freeSample ? "Sample on" : "Free sample"}
                </Button>
                <a
                  href={`/sanctum/tracks/${t.id}`}
                  className="inline-flex items-center rounded-[var(--radius)] border border-line px-3.5 py-1.5 text-[0.8125rem] uppercase tracking-[0.08em] text-text-dim transition-colors hover:border-text-dim/60 hover:text-text"
                >
                  Open
                </a>
                <ConfirmDelete
                  action={deleteTrack}
                  fields={{ trackId: t.id }}
                  warn={copy.sanctum.delete.warnTrack}
                  onDone={() => onDeleted(t.id)}
                  className="ml-auto"
                />
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
                    Premiere (UTC) — leave empty for none
                    <Input
                      name="premiereAt"
                      type="datetime-local"
                      defaultValue={t.premiereAt ? t.premiereAt.slice(0, 16) : ""}
                    />
                    <span className="text-text-dim/70">
                      A future time seals it in the catalog with a countdown until it
                      begins; publishing then holds the new-file push for the premiere.
                    </span>
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
