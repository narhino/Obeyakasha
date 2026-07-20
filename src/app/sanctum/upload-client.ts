"use client";

import { planChunks } from "@/lib/media/chunk-plan";

/**
 * Shared client-side upload primitives. Files are sliced into ~5 MB parts and
 * sent STRICTLY SEQUENTIALLY, each its own short raw-body POST — the fix for the
 * Cloudflare 100 s (524) origin timeout that killed whole-file uploads on a home
 * upstream. Each part retries on its own (network drop / 5xx), which is the
 * resumability. Used by the Library UploadQueue (new draft tracks), the Patreon
 * attach flows (attach onto an existing shell via `?trackId=`), and F1's Yours
 * shelf (`endpoint: /api/me/upload`). Duration is probed in the browser so the
 * server needs no ffprobe.
 */

export type UploadState = "queued" | "uploading" | "done" | "error";

/** Audio files we accept in drop zones / file pickers. */
export const AUDIO_RE = /\.(mp3|m4a|mp4|wav|aac|ogg)$/i;

/** ~5 MB parts: small enough that one part finishes well under a minute on a
 *  slow (~1 Mbps) upstream — and under Cloudflare's 100 s / 100 MB per-request
 *  limits — large enough to keep the request count sane. */
const CHUNK_SIZE = 5 * 1024 * 1024;
/** Per-chunk resend attempts on a network drop or 5xx before giving up. */
const MAX_CHUNK_RETRIES = 3;

/** Read an audio file's duration via a throwaway <audio> element. */
export function probeDuration(file: File): Promise<number | null> {
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
    // Safety: never hang on a file the browser can't parse.
    setTimeout(() => done(null), 8000);
    audio.src = url;
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Whole-file SHA-256 as lowercase hex — the server re-derives it from the
 *  reassembled file and refuses to ingest a mismatch. */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function errorFrom(text: string, status: number): string {
  try {
    const msg = (JSON.parse(text) as { error?: unknown }).error;
    if (typeof msg === "string" && msg) return msg;
  } catch {
    /* fall through */
  }
  return `upload failed (${status})`;
}

/** One chunk POST as a Promise. Resolves for ANY HTTP response; rejects only on
 *  a transport failure (network drop / timeout). `onChunkProgress` drives the
 *  live bar for this part. */
function postChunk(
  url: string,
  body: Blob,
  onChunkProgress: (loaded: number, total: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onChunkProgress(e.loaded, e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("network error"));
    xhr.ontimeout = () => reject(new Error("network error"));
    xhr.send(body);
  });
}

/** Send ONE chunk, retrying the SAME chunk on a network drop or 5xx (up to
 *  MAX_CHUNK_RETRIES) before rejecting. Never advances past a failed chunk. */
async function sendChunkWithRetry(
  url: string,
  body: Blob,
  onChunkProgress: (loaded: number, total: number) => void,
): Promise<{ status: number; text: string }> {
  let attempt = 0;
  for (;;) {
    let res: { status: number; text: string };
    try {
      res = await postChunk(url, body, onChunkProgress);
    } catch {
      // Transport failure — retry the same chunk from the start.
      if (attempt++ < MAX_CHUNK_RETRIES) {
        await sleep(300 * attempt);
        continue;
      }
      throw new Error("network error");
    }
    if (res.status >= 200 && res.status < 300) return res;
    if (res.status >= 500 && attempt++ < MAX_CHUNK_RETRIES) {
      await sleep(300 * attempt);
      continue;
    }
    // 4xx, or 5xx out of retries — surface the server's (in-voice) message.
    throw new Error(errorFrom(res.text, res.status));
  }
}

/**
 * Stream one file to the upload route in sequential chunks. With `trackId` the
 * bytes attach to that existing shell track (R8); otherwise a new draft track is
 * created. `onProgress` reports the overall fraction across all chunks. Resolves
 * with the created/updated track id (carried on the final chunk's response).
 *
 * Signature unchanged — every caller keeps working without a change.
 */
export async function uploadAudio(
  file: File,
  opts: {
    trackId?: string;
    durationS?: number | null;
    onProgress?: (fraction: number) => void;
    /** Target route. Defaults to the Sanctum uploader; F1's subject shelf points
     *  it at /api/me/upload (same primitive, different endpoint). */
    endpoint?: string;
  } = {},
): Promise<{ trackId: string }> {
  const endpoint = opts.endpoint ?? "/api/sanctum/upload";
  const uploadId = crypto.randomUUID();
  const sha256 = await sha256Hex(file);
  const ranges = planChunks(file.size, CHUNK_SIZE);
  const count = ranges.length;

  let result: { trackId: string } = { trackId: "" };

  for (const range of ranges) {
    const params = new URLSearchParams({
      uploadId,
      index: String(range.index),
      count: String(count),
      filename: file.name,
      size: String(file.size),
      sha256,
    });
    if (opts.durationS != null) params.set("durationS", String(opts.durationS));
    if (opts.trackId) params.set("trackId", opts.trackId);

    const chunk = file.slice(range.start, range.end);
    const res = await sendChunkWithRetry(
      `${endpoint}?${params.toString()}`,
      chunk,
      (loaded, total) => {
        const done = range.index + (total > 0 ? loaded / total : 1);
        opts.onProgress?.(Math.min(1, done / count));
      },
    );
    // Snap the bar to whole-chunk boundaries so it never stalls between parts.
    opts.onProgress?.(Math.min(1, (range.index + 1) / count));

    if (range.index === count - 1) {
      try {
        result = JSON.parse(res.text) as { trackId: string };
      } catch {
        result = { trackId: "" };
      }
    }
  }

  return result;
}
