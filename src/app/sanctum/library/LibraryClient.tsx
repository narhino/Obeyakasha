"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, Input, Whisper } from "@/components/ui";
import { UploadQueue } from "./UploadQueue";
import { usePolling } from "./usePolling";
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

const WORKING = new Set(["queued", "processing"]);

function StatusBadge({ status }: { status: LibraryRow["transcriptStatus"] }) {
  if (status === "done") return <Badge tone="gold">script ready</Badge>;
  if (status === "failed") return <Badge tone="danger">script failed</Badge>;
  if (status === "processing") return <Badge tone="neutral">transcribing…</Badge>;
  if (status === "queued") return <Badge tone="neutral">queued</Badge>;
  return <Badge tone="sealed">no script</Badge>;
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

  const anyWorking = useMemo(
    () => tracks.some((t) => WORKING.has(t.transcriptStatus)),
    [tracks],
  );
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
                          : "sealed"
                    }
                  >
                    {t.visibility}
                  </Badge>
                  <StatusBadge status={t.transcriptStatus} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {t.visibility !== "published" ? (
                  <Button
                    size="sm"
                    variant="gold"
                    disabled={!t.hasAudio || busyId === t.id}
                    onClick={() => onVisibility(t.id, "published")}
                  >
                    Publish
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === t.id}
                    onClick={() => onVisibility(t.id, "draft")}
                  >
                    Unpublish
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    !t.hasAudio ||
                    busyId === t.id ||
                    WORKING.has(t.transcriptStatus)
                  }
                  onClick={() => onTranscribe(t.id)}
                >
                  {t.transcriptStatus === "done" ? "Re-transcribe" : "Transcribe"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === t.id}
                  onClick={() => onOrganize(t.id)}
                >
                  Organize
                </Button>
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
