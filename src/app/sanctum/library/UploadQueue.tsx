"use client";

import { useCallback, useRef, useState } from "react";
import { Whisper } from "@/components/ui";
import {
  AUDIO_RE,
  probeDuration,
  uploadAudio,
  type UploadState,
} from "../upload-client";

/**
 * Multi-file streaming uploader (ROADMAP-v1.5 C1.2). Each file uploads via XHR
 * to /api/sanctum/upload so `upload.onprogress` drives a real per-file bar —
 * the fix for "I click upload and nothing shows." Concurrency 2; drag-drop,
 * multi-select, and whole-folder drop supported. The upload primitives are
 * shared with the Patreon attach flows (see ../upload-client).
 */

const CONCURRENCY = 2;

interface UploadItem {
  id: string;
  file: File;
  progress: number; // 0..1
  state: UploadState;
  error?: string;
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
          await uploadAudio(item.file, {
            durationS,
            onProgress: (f) => patch(item.id, { progress: f }),
          });
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
