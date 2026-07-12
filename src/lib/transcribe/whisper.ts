import { env } from "@/lib/env";
import type { TranscriptResult, TranscriptionProvider } from "./provider";

/**
 * Self-hosted Whisper via the transcriber sidecar (free). Posts the audio bytes
 * as multipart so the sidecar needs no access to storage; audio never leaves
 * the server. See src/transcriber/main.py.
 */
export class WhisperProvider implements TranscriptionProvider {
  readonly kind = "whisper" as const;

  async transcribe(
    bytes: Uint8Array,
    filename: string,
    language?: string,
  ): Promise<TranscriptResult> {
    const base = env.TRANSCRIBER_URL || "http://localhost:8000";
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart]), filename);
    if (language) form.append("language", language);

    const res = await fetch(`${base}/transcribe`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Transcriber ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      language: string;
      full_text: string;
      segments: { start: number; end: number; text: string }[];
    };
    return {
      language: data.language ?? "en",
      fullText: data.full_text ?? "",
      segments: data.segments ?? [],
    };
  }
}
