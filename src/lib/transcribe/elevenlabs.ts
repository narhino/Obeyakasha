import { env } from "@/lib/env";
import type {
  TranscriptResult,
  TranscriptSegment,
  TranscriptionProvider,
} from "./provider";

/**
 * ElevenLabs Scribe (hosted STT). A paid, cloud alternative to the self-hosted
 * Whisper sidecar — the audio is sent to ElevenLabs and transcribed there, so it
 * needs no local model, no server memory, and never fails from a small VPS
 * running out of RAM. Selected automatically when ELEVENLABS_API_KEY is set
 * (see ./index). Audio bytes are POSTed as multipart; the key stays server-side.
 *
 * Docs: POST https://api.elevenlabs.io/v1/speech-to-text (model_id=scribe_v1),
 * returns { language_code, text, words: [{ text, start, end, type }] }.
 */
const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL_ID = "scribe_v1";

/** How long a run of words may grow before it's flushed into its own segment
 *  (also flushed at sentence-final punctuation) — keeps click-to-seek useful. */
const MAX_SEGMENT_S = 12;

interface ScribeWord {
  text: string;
  start?: number;
  end?: number;
  type?: string;
}

/** Group word-level timings into sentence-ish segments for the dossier. */
function segmentsFromWords(words: ScribeWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let buf: ScribeWord[] = [];
  const flush = () => {
    const spoken = buf.filter((w) => w.type !== "spacing");
    if (spoken.length === 0) {
      buf = [];
      return;
    }
    const start = spoken[0]!.start ?? 0;
    const end = spoken[spoken.length - 1]!.end ?? start;
    const text = buf
      .map((w) => w.text)
      .join("")
      .trim();
    if (text) segments.push({ start, end, text });
    buf = [];
  };
  for (const w of words) {
    buf.push(w);
    const isSentenceEnd = /[.!?]["')\]]?\s*$/.test(w.text);
    const first = buf.find((x) => x.type !== "spacing");
    const span = (w.end ?? 0) - (first?.start ?? 0);
    if (isSentenceEnd || span >= MAX_SEGMENT_S) flush();
  }
  flush();
  return segments;
}

export class ElevenLabsProvider implements TranscriptionProvider {
  readonly kind = "elevenlabs" as const;

  async transcribe(
    bytes: Uint8Array,
    filename: string,
    language?: string,
  ): Promise<TranscriptResult> {
    const apiKey = env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart]), filename);
    form.append("model_id", MODEL_ID);
    form.append("timestamps_granularity", "word");
    if (language) form.append("language_code", language);

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      language_code?: string;
      text?: string;
      words?: ScribeWord[];
    };

    const fullText = (data.text ?? "").trim();
    const words = data.words ?? [];
    const segments = words.length
      ? segmentsFromWords(words)
      : fullText
        ? [{ start: 0, end: 0, text: fullText }]
        : [];

    return {
      language: data.language_code ?? language ?? "en",
      fullText,
      segments,
    };
  }
}
