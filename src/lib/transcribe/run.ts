import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks, transcripts } from "@/lib/db/schema";
import { mediaProvider } from "@/lib/media";
import { logAudit } from "@/lib/audit";
import { transcriptionProvider } from "./index";

/**
 * Transcribe one track (PLAN §8). Reads the audio bytes via the media provider,
 * runs the transcription provider, and stores the transcript. Designed to be
 * called fire-and-forget from the admin action (the app runs on a persistent
 * Node server, so background work continues after the action returns).
 */
export async function transcribeTrack(trackId: string): Promise<void> {
  const [track] = await db
    .select({ streamKey: tracks.streamKey, title: tracks.title })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!track?.streamKey) return;

  // Upsert a processing row.
  await db
    .insert(transcripts)
    .values({ trackId, status: "processing" })
    .onConflictDoUpdate({
      target: transcripts.trackId,
      set: { status: "processing", updatedAt: new Date() },
    });

  try {
    const bytes = await mediaProvider().readBytes(track.streamKey);
    const filename = track.streamKey.split("/").pop() ?? "audio.m4a";
    const result = await transcriptionProvider().transcribe(bytes, filename);

    // An empty transcript is not a script. This happens when the transcriber
    // sidecar runs in stub mode (TRANSCRIBER_STUB=1) or the model returns
    // nothing — either way it must never flip the track to a gold "script
    // ready" badge with no text behind it. Treat it as a failure so the UI
    // stays honest and the goddess can re-transcribe once the model is live.
    if (!result.fullText.trim()) {
      throw new Error(
        "Transcriber returned no text — is it running the real model (TRANSCRIBER_STUB=0)?",
      );
    }

    await db
      .update(transcripts)
      .set({
        status: "done",
        language: result.language,
        segments: result.segments,
        fullText: result.fullText,
        model: transcriptionProvider().kind,
        updatedAt: new Date(),
      })
      .where(eq(transcripts.trackId, trackId));
    await logAudit(null, "transcript.done", {
      trackId,
      chars: result.fullText.length,
    });
  } catch (err) {
    await db
      .update(transcripts)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(transcripts.trackId, trackId));
    await logAudit(null, "transcript.failed", {
      trackId,
      message: err instanceof Error ? err.message : String(err),
    });
    // Re-throw so the job queue can retry with backoff (ROADMAP C1.1). The
    // legacy fire-and-forget caller guards with `.catch(() => {})`.
    throw err;
  }
}
