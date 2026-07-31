"use client";

import { useRef, useState } from "react";
import type { WhisperImageFit } from "@/lib/db/schema/relationship";
import { IconWarn } from "@/components/ui/icons";
import { Whisper } from "@/components/ui";
import { WhisperImage } from "./WhispersFeed";

/** Everything a whisper's picture carries. `key` empty means no picture. */
export interface WhisperImageValue {
  key: string;
  /** The picture's true pixel size, measured here before it's sent. */
  w: number | null;
  h: number | null;
  fit: WhisperImageFit;
  /** What to show her right now — a local object URL, or the signed URL of one
   *  already posted. Never submitted; the key is what the server stores. */
  previewUrl: string | null;
}

export const NO_IMAGE: WhisperImageValue = {
  key: "",
  w: null,
  h: null,
  fit: "natural",
  previewUrl: null,
};

/** The three ways a picture can sit on a card, in her words. */
const FITS: { value: WhisperImageFit; label: string; hint: string }[] = [
  { value: "natural", label: "As it is", hint: "Posted whole — nothing cut off." },
  { value: "wide", label: "Wide", hint: "Cropped to a banner across the card." },
  { value: "square", label: "Square", hint: "Cropped to a square." },
];

/**
 * Attach a picture to a whisper and decide how it sits.
 *
 * The default is `natural`, and it is the honest one: the picture posts at its
 * own proportions. Cropping is a thing she picks, with the result shown to her
 * before she posts — it is never something the card does to her photo behind
 * her back. The preview below renders with the SAME component the feed uses, so
 * what she sees here is exactly what lands.
 */
export function WhisperImageField({
  value,
  onChange,
}: {
  value: WhisperImageValue;
  onChange: (v: WhisperImageValue) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > 8 * 1024 * 1024) {
      setError("That image is over 8 MB — pick a lighter one.");
      return;
    }
    setUploading(true);
    // Show it immediately; the upload catches up behind the preview.
    const localUrl = URL.createObjectURL(file);
    // Measure it here — the browser is the only place that knows the true size,
    // and the card needs it to hold the right space before the image lands.
    const size = await measure(localUrl);
    onChange({
      key: "",
      w: size?.w ?? null,
      h: size?.h ?? null,
      fit: value.fit,
      previewUrl: localUrl,
    });
    try {
      const res = await fetch("/api/sanctum/whisper-image", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const data = (await res.json()) as { imageKey?: string; error?: string };
      if (!res.ok || !data.imageKey) {
        setError(data.error ?? "That image didn't take. Try another.");
        onChange({ ...NO_IMAGE, fit: value.fit });
        return;
      }
      onChange({
        key: data.imageKey,
        w: size?.w ?? null,
        h: size?.h ?? null,
        fit: value.fit,
        previewUrl: localUrl,
      });
    } catch {
      setError("That image didn't take. Try another.");
      onChange({ ...NO_IMAGE, fit: value.fit });
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setError(null);
    onChange({ ...NO_IMAGE });
    if (fileInput.current) fileInput.current.value = "";
  }

  const fit = FITS.find((f) => f.value === value.fit)!;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="rounded-[var(--radius-full)] border border-line px-3 py-1 text-xs tracking-[0.04em] text-text-dim transition-colors duration-[var(--dur-med)] hover:border-gold hover:text-gold disabled:opacity-50"
        >
          {value.previewUrl ? "Change image" : "Image"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          className="hidden"
        />
        {value.previewUrl ? (
          <button
            type="button"
            onClick={clear}
            className="rounded-[var(--radius-full)] border border-line px-3 py-1 text-xs tracking-[0.04em] text-text-dim transition-colors duration-[var(--dur-med)] hover:border-danger hover:text-danger"
          >
            Remove image
          </button>
        ) : null}
      </div>

      {value.previewUrl ? (
        <div className="rounded-[var(--radius)] border border-line/60 bg-surface p-2">
          <div className="flex flex-wrap items-center gap-2">
            {FITS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => onChange({ ...value, fit: f.value })}
                className={`rounded-[var(--radius-full)] border px-3 py-1 text-xs tracking-[0.04em] transition-colors duration-[var(--dur-med)] ${
                  value.fit === f.value
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-line text-text-dim hover:border-gold/60 hover:text-text"
                }`}
              >
                {f.label}
              </button>
            ))}
            {value.w && value.h ? (
              <span className="ml-auto text-[0.6875rem] tabular-nums text-text-dim/60">
                {value.w}×{value.h}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-text-dim/75">{fit.hint}</p>

          {/* The card's own image component — this IS how it will look. */}
          <div className="relative mt-1">
            <WhisperImage
              src={value.previewUrl}
              fit={value.fit}
              w={value.w}
              h={value.h}
            />
            {uploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-bg/60 text-xs tracking-[0.08em] text-gold">
                lifting it…
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <Whisper className="flex items-center gap-1.5 text-danger">
          <IconWarn size={14} /> {error}
        </Whisper>
      ) : null}
    </div>
  );
}

/** Hidden carriers so a plain form submit sends the picture with the whisper. */
export function WhisperImageInputs({ value }: { value: WhisperImageValue }) {
  return (
    <>
      <input type="hidden" name="imageKey" value={value.key} />
      <input type="hidden" name="imageW" value={value.w ?? ""} />
      <input type="hidden" name="imageH" value={value.h ?? ""} />
      <input type="hidden" name="imageFit" value={value.fit} />
    </>
  );
}

/** Read a picture's true pixel size; null if the browser can't decode it. */
function measure(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve(
        img.naturalWidth && img.naturalHeight
          ? { w: img.naturalWidth, h: img.naturalHeight }
          : null,
      );
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
