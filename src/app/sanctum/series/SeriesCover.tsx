"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ornament } from "@/components/ui";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/webp", "image/jpeg", "image/png"];

/**
 * Series cover uploader (R4). Streams a single raw image body to
 * POST /api/sanctum/series-art?playlistId=, then refreshes to show the signed
 * cover the server re-derives. Goddess-only (the route re-checks the role).
 */
export function SeriesCover({
  playlistId,
  artworkUrl,
  mark,
}: {
  playlistId: string;
  artworkUrl: string | null;
  mark: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    if (!ALLOWED.includes(file.type)) {
      setState("error");
      setError("Use a WebP, JPEG, or PNG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setState("error");
      setError("That image is over 5MB.");
      return;
    }
    setState("uploading");
    setError(null);
    try {
      const res = await fetch(
        `/api/sanctum/series-art?playlistId=${encodeURIComponent(playlistId)}`,
        { method: "POST", headers: { "content-type": file.type }, body: file },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `upload failed (${res.status})`);
      }
      setState("idle");
      router.refresh();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "upload failed");
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius)] border border-line/80 bg-surface">
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artworkUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-accent-soft/30 px-3">
            <Ornament className="w-full">{mark}</Ornament>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={state === "uploading"}
          className="rounded-[var(--radius)] border border-line px-3 py-1.5 text-xs uppercase tracking-[0.1em] text-text-dim transition-colors duration-[var(--dur-med)] hover:border-gold/50 hover:text-gold disabled:opacity-40"
        >
          {state === "uploading" ? "Uploading…" : artworkUrl ? "Replace cover" : "Add cover"}
        </button>
        <p className="mt-1 text-[0.6875rem] text-text-dim/70">WebP · JPEG · PNG, up to 5MB</p>
        {state === "error" && error ? (
          <p className="mt-1 text-[0.6875rem] text-danger">{error}</p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/webp,image/jpeg,image/png"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
