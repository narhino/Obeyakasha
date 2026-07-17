"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Whisper } from "@/components/ui";
import {
  AUDIO_RE,
  probeDuration,
  uploadAudio,
  type UploadState,
} from "../../upload-client";
import {
  proposeMatches,
  type MatchConfidence,
} from "@/lib/patreon/match";
import { formatDay } from "@/lib/format/when";

interface Shell {
  id: string;
  title: string;
  createdAt: string;
}

interface Row {
  id: string;
  file: File;
  /** Chosen shell (from the matcher, or reassigned by hand); null = skip. */
  shellId: string | null;
  confidence: MatchConfidence;
  state: UploadState;
  progress: number; // 0..1
  error?: string;
}

const CONCURRENCY = 2;

export function AttachClient({ shells: initialShells }: { shells: Shell[] }) {
  const [shells, setShells] = useState<Shell[]>(initialShells);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const patchRow = useCallback((id: string, next: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }, []);

  // A shell title lookup for rendering assigned rows.
  const shellTitle = useMemo(() => {
    const m = new Map(shells.map((s) => [s.id, s.title] as const));
    return (id: string | null) => (id ? (m.get(id) ?? "(attached)") : null);
  }, [shells]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const accepted = Array.from(files).filter((f) => AUDIO_RE.test(f.name));
      if (accepted.length === 0) return;

      setRows((prevRows) => {
        // Match only against shells not already claimed by an existing row.
        const taken = new Set(
          prevRows.map((r) => r.shellId).filter((v): v is string => Boolean(v)),
        );
        const available = shells.filter((s) => !taken.has(s.id));
        const proposals = proposeMatches(
          accepted.map((f) => f.name),
          available,
        );
        const newRows: Row[] = accepted.map((file, i) => {
          const p = proposals[i]!;
          return {
            id: `a${seq.current++}`,
            file,
            shellId: p.shellId,
            confidence: p.confidence,
            state: "queued",
            progress: 0,
          };
        });
        return [...prevRows, ...newRows];
      });
    },
    [shells],
  );

  const uploadRow = useCallback(
    async (row: Row) => {
      if (!row.shellId) return;
      const shellId = row.shellId;
      patchRow(row.id, { state: "uploading", progress: 0, error: undefined });
      try {
        const durationS = await probeDuration(row.file);
        await uploadAudio(row.file, {
          trackId: shellId,
          durationS,
          onProgress: (f) => patchRow(row.id, { progress: f }),
        });
        patchRow(row.id, { state: "done", progress: 1 });
        // The shell is spoken for — drop it from the waiting list + dropdowns.
        setShells((prev) => prev.filter((s) => s.id !== shellId));
      } catch (e) {
        patchRow(row.id, {
          state: "error",
          error: e instanceof Error ? e.message : "attach failed",
        });
      }
    },
    [patchRow],
  );

  const attachAll = useCallback(async () => {
    // Snapshot the assignable rows at click time; run a small concurrency pool.
    const queue = rows.filter(
      (r) => r.shellId && r.state !== "done" && r.state !== "uploading",
    );
    if (queue.length === 0) return;
    setRunning(true);
    let i = 0;
    const runners = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      async () => {
        while (i < queue.length) {
          const row = queue[i++]!;
          await uploadRow(row);
        }
      },
    );
    await Promise.all(runners);
    setRunning(false);
  }, [rows, uploadRow]);

  const reassign = (rowId: string, value: string) =>
    patchRow(rowId, {
      shellId: value === "" ? null : value,
      // A hand-picked pairing is trusted; a cleared one is a deliberate skip.
      confidence: value === "" ? "none" : "high",
    });

  const readyCount = rows.filter(
    (r) => r.shellId && r.state !== "done",
  ).length;
  const doneCount = rows.filter((r) => r.state === "done").length;

  return (
    <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      {/* Waiting shells */}
      <aside className="order-2 md:order-1">
        <Whisper className="mb-2 text-xs uppercase tracking-[0.14em]">
          {shells.length} waiting
        </Whisper>
        <div className="space-y-1.5">
          {shells.length === 0 ? (
            <Card>
              <Whisper className="text-sm">
                All attached. Nothing else waits.
              </Whisper>
            </Card>
          ) : (
            shells.map((s) => {
              const claimed = rows.some(
                (r) => r.shellId === s.id && r.state !== "done",
              );
              return (
                <div
                  key={s.id}
                  className={`rounded-[var(--radius)] border px-3 py-2 ${
                    claimed
                      ? "border-gold/30 bg-gold/5"
                      : "border-line/70 bg-surface"
                  }`}
                >
                  <p className="truncate text-sm text-text">{s.title}</p>
                  <Whisper className="text-[0.7rem]">
                    {formatDay(s.createdAt)}
                    {claimed ? " · matched" : ""}
                  </Whisper>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Drop zone + proposed pairs */}
      <div className="order-1 md:order-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          className={`cursor-pointer rounded-[var(--radius-lg)] border border-dashed px-5 py-8 text-center transition-colors duration-[var(--dur-med)] ${
            dragOver
              ? "border-gold/70 bg-gold/5"
              : "border-line hover:border-text-dim/60"
          }`}
        >
          <p className="font-[family-name:var(--font-display)] text-lg text-text">
            Drop audio here
          </p>
          <Whisper className="mt-1 text-xs">
            One file or the whole batch — we&apos;ll match them to the posts.
          </Whisper>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {rows.length > 0 ? (
          <>
            <div className="mt-4 flex items-center justify-between">
              <Whisper className="text-xs uppercase tracking-[0.14em]">
                {doneCount > 0 ? `${doneCount} attached · ` : ""}
                {readyCount} ready
              </Whisper>
              <Button
                size="sm"
                variant="gold"
                loading={running}
                disabled={running || readyCount === 0}
                onClick={() => void attachAll()}
              >
                Attach {readyCount > 0 ? readyCount : ""}
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {rows.map((r) => (
                <RowCard
                  key={r.id}
                  row={r}
                  shells={shells}
                  rows={rows}
                  running={running}
                  shellTitle={shellTitle}
                  onReassign={(v) => reassign(r.id, v)}
                  onRetry={() => void uploadRow(r)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ConfidenceChip({
  confidence,
  hasShell,
}: {
  confidence: MatchConfidence;
  hasShell: boolean;
}) {
  if (!hasShell) return <Badge tone="danger">no match</Badge>;
  if (confidence === "high") return <Badge tone="gold">match</Badge>;
  return <Badge tone="neutral">uncertain</Badge>;
}

function RowCard({
  row,
  shells,
  rows,
  running,
  shellTitle,
  onReassign,
  onRetry,
}: {
  row: Row;
  shells: Shell[];
  rows: Row[];
  running: boolean;
  shellTitle: (id: string | null) => string | null;
  onReassign: (value: string) => void;
  onRetry: () => void;
}) {
  // Shells this row may pick: unclaimed ones, plus its own current pick.
  const claimedByOthers = new Set(
    rows
      .filter((o) => o.id !== row.id && o.shellId && o.state !== "done")
      .map((o) => o.shellId as string),
  );
  const options = shells.filter(
    (s) => s.id === row.shellId || !claimedByOthers.has(s.id),
  );
  const done = row.state === "done";
  const locked = running || row.state === "uploading" || done;

  return (
    <div className="rounded-[var(--radius)] border border-line/70 bg-bg/40 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-text">{row.file.name}</p>
          {done ? (
            <Whisper className="text-[0.7rem] text-gold">
              attached to {shellTitle(row.shellId) ?? "post"}
            </Whisper>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.state === "error" ? (
            <span className="text-[0.7rem] text-danger">{row.error}</span>
          ) : null}
          {done ? (
            <Badge tone="gold">done</Badge>
          ) : (
            <ConfidenceChip
              confidence={row.confidence}
              hasShell={Boolean(row.shellId)}
            />
          )}
        </div>
      </div>

      {!done ? (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={row.shellId ?? ""}
            disabled={locked}
            onChange={(e) => onReassign(e.target.value)}
            className="min-w-0 flex-1 truncate rounded-[var(--radius)] border border-line bg-bg/60 px-2 py-1.5 text-xs text-text transition-colors focus:border-gold/70 focus:outline-none disabled:opacity-50"
          >
            <option value="">— skip (don&apos;t attach) —</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          {row.state === "error" ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={running || !row.shellId}
              className="shrink-0 rounded-[var(--radius)] border border-line px-2.5 py-1.5 text-[0.7rem] uppercase tracking-[0.08em] text-text-dim hover:border-gold/50 hover:text-gold disabled:opacity-40"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {row.state === "uploading" || (row.progress > 0 && !done) ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              row.state === "error" ? "bg-danger" : "bg-gold"
            }`}
            style={{ width: `${Math.round(row.progress * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
