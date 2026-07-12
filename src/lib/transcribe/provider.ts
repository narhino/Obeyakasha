/**
 * Transcription provider abstraction (PLAN §8). Same idea as media/LLM:
 * the app calls this interface; the adapter (self-hosted Whisper now, an
 * ElevenLabs Scribe adapter later if desired) is chosen by env.
 */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  language: string;
  fullText: string;
  segments: TranscriptSegment[];
}

export interface TranscriptionProvider {
  readonly kind: string;
  transcribe(
    bytes: Uint8Array,
    filename: string,
    language?: string,
  ): Promise<TranscriptResult>;
}
