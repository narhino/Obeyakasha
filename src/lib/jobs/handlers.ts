import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { transcribeTrack } from "@/lib/transcribe/run";
import { organizeTrack } from "@/lib/organize/run";
import { analyzeTrack } from "@/lib/analyze/run";
import { importPatreonPost } from "@/lib/patreon/import";
import { getSetting } from "@/lib/settings";
import { enqueue } from "./queue";
import { registerHandler } from "./runner";

type Pipeline =
  | "uploaded"
  | "transcribing"
  | "organizing"
  | "ready"
  | "failed_transcribe"
  | "failed_organize";

async function setPipeline(trackId: string, pipeline: Pipeline): Promise<void> {
  await db
    .update(tracks)
    .set({ pipeline, updatedAt: new Date() })
    .where(eq(tracks.id, trackId));
}

/**
 * Wire the core job handlers (ROADMAP-v1.5 C1.1 + C1.3). Called once at worker
 * boot. Handlers own the per-track pipeline state machine and the auto-pipeline
 * chaining (transcribe → organize) gated by the `auto_pipeline` setting.
 * Concurrency: transcription is CPU-bound (1); organize is cheap (2).
 */
export function registerCoreJobHandlers(): void {
  registerHandler(
    "transcribe",
    async (payload) => {
      const trackId = String(payload.trackId ?? "");
      if (!trackId) throw new Error("transcribe: missing trackId");
      await setPipeline(trackId, "transcribing");
      try {
        await transcribeTrack(trackId);
      } catch (err) {
        await setPipeline(trackId, "failed_transcribe");
        throw err;
      }
      if (await getSetting("auto_pipeline")) {
        await setPipeline(trackId, "organizing");
        // analyze (dossier) and organize (review proposal) are independent
        // writers over the same transcript — run both; an analyze failure must
        // never block the track from reaching `ready`.
        await enqueue("analyze", { trackId }, { dedupeKey: `analyze:${trackId}` });
        await enqueue(
          "organize",
          { trackId },
          { dedupeKey: `organize:${trackId}` },
        );
      } else {
        await setPipeline(trackId, "ready");
      }
    },
    1,
  );

  // Heavy dossier analysis (ROADMAP Phase D). Concurrency 1 — D3 routes this to
  // Opus 4.8. Does not touch the pipeline state; it's supplementary to organize.
  registerHandler(
    "analyze",
    async (payload) => {
      const trackId = String(payload.trackId ?? "");
      if (!trackId) throw new Error("analyze: missing trackId");
      await analyzeTrack(trackId);
    },
    1,
  );

  registerHandler(
    "organize",
    async (payload) => {
      const trackId = String(payload.trackId ?? "");
      if (!trackId) throw new Error("organize: missing trackId");
      await setPipeline(trackId, "organizing");
      try {
        await organizeTrack(trackId);
      } catch (err) {
        await setPipeline(trackId, "failed_organize");
        throw err;
      }
      await setPipeline(trackId, "ready");
    },
    2,
  );

  // Import one Patreon post's audio → the pipeline (ROADMAP Phase I).
  registerHandler(
    "patreon-import",
    async (payload) => {
      const postId = String(payload.postId ?? "");
      if (!postId) throw new Error("patreon-import: missing postId");
      await importPatreonPost(postId);
    },
    2,
  );
}
