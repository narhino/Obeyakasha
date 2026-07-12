import { transcribeTrack } from "@/lib/transcribe/run";
import { organizeTrack } from "@/lib/organize/run";
import { registerHandler } from "./runner";

/**
 * Wire the core job handlers (ROADMAP-v1.5 C1.1). Called once at worker boot.
 * Concurrency per kind: transcription is CPU-bound (1); organize is cheap (2).
 * Phases D/I add `analyze` and `patreon-import` handlers here later.
 */
export function registerCoreJobHandlers(): void {
  registerHandler(
    "transcribe",
    async (payload) => {
      const trackId = String(payload.trackId ?? "");
      if (!trackId) throw new Error("transcribe: missing trackId");
      await transcribeTrack(trackId);
    },
    1,
  );

  registerHandler(
    "organize",
    async (payload) => {
      const trackId = String(payload.trackId ?? "");
      if (!trackId) throw new Error("organize: missing trackId");
      await organizeTrack(trackId);
    },
    2,
  );
}
