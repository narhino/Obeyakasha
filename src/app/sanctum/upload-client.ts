"use client";

/**
 * Shared client-side upload primitives (ROADMAP-v1.5 C1.2 + R8). One XHR per
 * file so the browser's `upload.onprogress` drives a real progress bar. Used by
 * the Library UploadQueue (new draft tracks) and the Patreon attach flows
 * (attach onto an existing shell via `?trackId=`). Duration is probed in the
 * browser so the server needs no ffprobe.
 */

export type UploadState = "queued" | "uploading" | "done" | "error";

/** Audio files we accept in drop zones / file pickers. */
export const AUDIO_RE = /\.(mp3|m4a|mp4|wav|aac|ogg)$/i;

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

/**
 * Stream one file to the upload route. With `trackId` the bytes attach to that
 * existing shell track (R8); otherwise a new draft track is created. Resolves
 * with the created/updated track id.
 */
export function uploadAudio(
  file: File,
  opts: {
    trackId?: string;
    durationS?: number | null;
    onProgress?: (fraction: number) => void;
    /** Target route. Defaults to the Sanctum uploader; F1's subject shelf points
     *  it at /api/me/upload (same XHR + progress primitive, different endpoint). */
    endpoint?: string;
  } = {},
): Promise<{ trackId: string }> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ filename: file.name });
    if (opts.durationS != null) params.set("durationS", String(opts.durationS));
    if (opts.trackId) params.set("trackId", opts.trackId);
    const endpoint = opts.endpoint ?? "/api/sanctum/upload";
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${endpoint}?${params.toString()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
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
