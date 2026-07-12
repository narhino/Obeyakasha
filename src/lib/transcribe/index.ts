import { WhisperProvider } from "./whisper";
import type { TranscriptionProvider } from "./provider";

/**
 * Select the transcription provider. Self-hosted Whisper (free) is the default.
 * An ElevenLabs Scribe adapter can be added here and selected when
 * ELEVENLABS_API_KEY is set — deferred (Scribe is paid).
 */
let provider: TranscriptionProvider | null = null;

export function transcriptionProvider(): TranscriptionProvider {
  if (provider) return provider;
  provider = new WhisperProvider();
  return provider;
}

export type {
  TranscriptResult,
  TranscriptSegment,
  TranscriptionProvider,
} from "./provider";
