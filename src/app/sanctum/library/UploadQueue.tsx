"use client";

import { useCallback, useRef, useState } from "react";
import { Whisper } from "@/components/ui";

/**
 * Multi-file streaming uploader (ROADMAP-v1.5 C1.2). Each file uploads via XHR
 * to /api/sanctum/upload so `upload.onprogress` drives a real per-file bar —
 * the fix for "I click upload and nothing shows." Concurrency 2; drag-drop,
 * multi-select, and whole-folder drop supported. Duration is probed client-side
 * so the server needs no ffprobe.
 */

const CONCURRENCY = 2;
const AUDIO_RE = /\.(mp3|m4a|mp4|wav|aac|ogg)$/i;

type ItemState = "queued" | "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  progress: number; // 0..1
  state: ItemState;
  error?: string;
}

function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const done = (v: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    audio.onerror = () => done(null);
    // Safety: never hang the queue on a file the browser can't parse.
    setTimeout(() => done(null), 8000);
    audio.src = url;
  });
}

function putFile(
  file: File,
  durationS: number | null,
  onProgress: (fraction: number) => void,
): Promise<{ trackId: string }> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ filename: file.name });
    if (durationS != null) params.set("durationS", String(durationS));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/sanctum/upload?${params.toString()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ trackId: "" });
        }
      } else {
        let msg = `upload failed (${xhr.status})`;
        try {
          msg = JSON.parse(xhr.responseText).error ?? msg;
        } catch {
          /* keep default */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(file);
  });
}

export function UploadQueue({
  onUploaded,
  onActiveChange,
}: {
  onUploaded: () => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const activeRef = useRef(0);
  const queueRef = useRef<UploadItem[]>([]);
  const seq = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...next } : it)),
    );
  }, []);

  const pump = useCallback(() => {
    while (activeRef.current < CONCURRENCY && queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;
      activeRef.current += 1;
      onActiveChange?.(true);
      patch(item.id, { state: "uploading" });
      void (async () => {
        try {
          const durationS = await probeDuration(item.file);
          await putFile(item.file, durationS, (f) =>
            patch(item.id, { progress: f }),
          );
          patch(item.id, { state: "done", progress: 1 });
          onUploaded();
        } catch (err) {
          patch(item.id, {
            state: "error",
            error: err instanceof Error ? err.message : "failed",
          });
        } finally {
          activeRef.current -= 1;
          if (activeRef.current === 0 && queueRef.current.length === 0) {
            onActiveChange?.(false);
          }
          pump();
        }
      })();
    }
  }, [onActiveChange, onUploaded, patch]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const accepted = Array.from(files).filter((f) => AUDIO_RE.test(f.name));
      if (accepted.length === 0) return;
      const newItems: UploadItem[] = accepted.map((file) => ({
        id: `u${seq.current++}`,
        file,
        progress: 0,
        state: "queued",
      }));
      setItems((prev) => [...newItems, ...prev]);
      queueRef.current.push(...newItems);
      pump();
    },
    [pump],
  );

  const clearFinished = () =>
    setItems((prev) => prev.filter((it) => it.state !== "done"));

  const activeCount = items.filter(
    (i) => i.state === "uploading" || i.state === "queued",
  ).length;

  return (
    <div>
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
          Or click to choose — one file or many. They land as drafts.
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

      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <Whisper className="text-xs uppercase tracking-wide">
              {activeCount > 0 ? `${activeCount} uploading` : "Uploads"}
            </Whisper>
            <button
              type="button"
              onClick={clearFinished}
              className="text-xs text-text-dim hover:text-text"
            >
              Clear finished
            </button>
          </div>
          {items.map((it) => (
            <div
              key={it.id}
              className="rounded-[var(--radius)] border border-line/70 bg-bg/40 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-text-dim">
                  {it.file.name}
                </span>
                <span
                  className={
                    it.state === "error"
                      ? "text-danger"
                      : it.state === "done"
                        ? "text-gold"
                        : "text-text-dim"
                  }
                >
                  {it.state === "error"
                    ? (it.error ?? "failed")
                    : it.state === "done"
                      ? "done"
                      : `${Math.round(it.progress * 100)}%`}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${
                    it.state === "error" ? "bg-danger" : "bg-gold"
                  }`}
                  style={{
                    width: `${it.state === "done" ? 100 : Math.round(it.progress * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
