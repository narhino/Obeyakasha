import { env } from "@/lib/env";
import { WhisperProvider } from "./whisper";
import { ElevenLabsProvider } from "./elevenlabs";
import type { TranscriptionProvider } from "./provider";

/**
 * Select the transcription provider. Self-hosted Whisper (free) is the default;
 * setting ELEVENLABS_API_KEY switches to ElevenLabs Scribe (hosted, paid) —
 * transcription then runs in the cloud, immune to a small VPS's memory limits.
 * Setting the key IS the opt-in, so nothing bills unless you ask for it.
 */
let provider: TranscriptionProvider | null = null;

export function transcriptionProvider(): TranscriptionProvider {
  if (provider) return provider;
  provider = env.ELEVENLABS_API_KEY
    ? new ElevenLabsProvider()
    : new WhisperProvider();
  return provider;
}

export type {
  TranscriptResult,
  TranscriptSegment,
  TranscriptionProvider,
} from "./provider";
