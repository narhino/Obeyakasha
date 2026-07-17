import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { attachUploadToTrack, ingestUploadFromPath } from "@/lib/media/ingest";
import { enqueue } from "@/lib/jobs/queue";
import { getSetting } from "@/lib/settings";

/**
 * Streaming upload endpoint (ROADMAP-v1.5 C1.2). Accepts ONE audio file as a
 * raw request body (not multipart) so the browser's XHR `upload.onprogress`
 * drives a real progress bar. The body is streamed to a temp file (bounded
 * memory) and handed to the ingest pipeline. Goddess-only.
 *
 * Query params: filename (required), title, durationS (client-probed).
 *   - Default: creates a new draft track from the file.
 *   - `trackId` (R8): attaches the file to that existing shell track instead
 *     (must exist and have no audio yet) — the Patreon bulk-attach flow. 409 if
 *     the track already has audio.
 * Response: { trackId }.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "goddess") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename");
  if (!filename) {
    return Response.json({ error: "missing filename" }, { status: 400 });
  }
  const title = searchParams.get("title") || undefined;
  const durationRaw = searchParams.get("durationS");
  const durationNum =
    durationRaw && durationRaw !== "" ? Math.round(Number(durationRaw)) : null;
  const clientDurationS = Number.isFinite(durationNum as number)
    ? durationNum
    : null;

  // Optional attach target (R8): stream onto an existing shell instead of
  // creating a new track. Validate BEFORE we accept the (potentially large)
  // body so a bad target fails fast.
  const trackIdParam = searchParams.get("trackId");
  let attachTrackId: string | null = null;
  if (trackIdParam !== null) {
    if (!z.string().uuid().safeParse(trackIdParam).success) {
      return Response.json({ error: "invalid trackId" }, { status: 400 });
    }
    const [target] = await db
      .select({ id: tracks.id, streamKey: tracks.streamKey })
      .from(tracks)
      .where(eq(tracks.id, trackIdParam))
      .limit(1);
    if (!target) {
      return Response.json({ error: "track not found" }, { status: 404 });
    }
    if (target.streamKey != null) {
      return Response.json(
        { error: "track already has audio" },
        { status: 409 },
      );
    }
    attachTrackId = target.id;
  }

  if (!req.body) {
    return Response.json({ error: "empty body" }, { status: 400 });
  }

  const dir = await mkdtemp(join(tmpdir(), "akasha-upload-"));
  const tmpPath = join(dir, "upload.bin");
  try {
    await pipeline(
      Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(tmpPath),
    );

    const result = attachTrackId
      ? await attachUploadToTrack({
          trackId: attachTrackId,
          path: tmpPath,
          filename,
          clientDurationS,
        })
      : await ingestUploadFromPath({
          path: tmpPath,
          filename,
          title,
          clientDurationS,
        });

    await logAudit(
      session.user.id,
      attachTrackId ? "track.audio_attached" : "track.uploaded",
      { trackId: result.trackId, filename, durationS: result.durationS },
    );
    // Auto-pipeline (ROADMAP C1.3): drop it in, walk away. The worker chains
    // transcribe → organize; the track lands ready with tags proposed. Attaching
    // audio to a shell kicks the same chain off.
    if (await getSetting("auto_pipeline")) {
      await enqueue(
        "transcribe",
        { trackId: result.trackId },
        { dedupeKey: `transcribe:${result.trackId}` },
      );
    }
    return Response.json({ trackId: result.trackId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload failed";
    return Response.json({ error: message }, { status: 400 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
