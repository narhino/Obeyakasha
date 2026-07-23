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

    // Abort a hung sidecar so the job fails and retries rather than blocking the
    // single transcribe slot forever. Below the queue's 15-min reclaim window.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12 * 60_000);
    try {
      const res = await fetch(`${base}/transcribe`, {
        method: "POST",
        body: form,
        signal: controller.signal,
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
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error("Transcriber timed out after 12 min");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
