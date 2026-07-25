import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { attachUploadToTrack, ingestUploadFromPath } from "@/lib/media/ingest";
import {
  ChunkError,
  parseChunkParams,
  receiveChunk,
} from "@/lib/media/chunked";
import { enqueue } from "@/lib/jobs/queue";
import { getSetting } from "@/lib/settings";

/**
 * Chunked / resumable upload endpoint (the Cloudflare-524 fix). The browser
 * slices one audio file into ~5 MB parts and POSTs them sequentially; each part
 * is a short raw-body request that finishes well under Cloudflare's 100 s origin
 * timeout. `chunked.ts` reassembles them on disk (bounded memory), proves the
 * whole file's size + SHA-256 on the final part, then hands the assembled path
 * to the existing ingest pipeline. Goddess-only, re-checked on every chunk.
 *
 * Query params (per chunk): uploadId, index, count, filename, size, sha256,
 * durationS (client-probed), and optionally:
 *   - `trackId` (R8): attach the file to that existing shell track instead of
 *     creating one (must exist and have no audio yet — 404/409 fast-fail).
 *   - `title`: draft title for a new track (unused by the shared client).
 * Response: the final chunk returns { trackId }; earlier chunks { received }.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sane origin-side ceiling for the goddess's own masters (bounds temp disk). */
const SANCTUM_MAX_BYTES = 1024 * 1024 * 1024; // 1 GiB

export async function POST(req: NextRequest) {
  // Re-checked on EVERY chunk request — each chunk is its own POST.
  const session = await auth();
  if (!session?.user || session.user.role !== "goddess") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const parsed = parseChunkParams(searchParams);
  if (!parsed.ok) return parsed.response;
  const params = parsed.value;
  const title = searchParams.get("title") || undefined;

  return receiveChunk(req, params, {
    owner: userId,
    maxBytes: SANCTUM_MAX_BYTES,
    exposeErrors: true, // goddess-only UI — surface the real ingest error
    errors: {
      tooLarge: { error: "file too large" },
      corrupt: { error: "upload didn’t arrive intact — retry" },
      failed: { error: "upload failed" },
    },
    // Fast-fail the R8 attach target BEFORE accepting the (potentially large)
    // body, exactly as the old single-shot route did.
    onStart: async (p) => {
      if (!p.trackId) return;
      const [target] = await db
        .select({ id: tracks.id, streamKey: tracks.streamKey })
        .from(tracks)
        .where(eq(tracks.id, p.trackId))
        .limit(1);
      if (!target) throw new ChunkError(404, { error: "track not found" });
      if (target.streamKey != null) {
        throw new ChunkError(409, { error: "track already has audio" });
      }
    },
    onFinalize: async (p, assembledPath) => {
      const result = p.trackId
        ? await attachUploadToTrack({
            trackId: p.trackId,
            path: assembledPath,
            filename: p.filename,
            clientDurationS: p.durationS,
          })
        : await ingestUploadFromPath({
            path: assembledPath,
            filename: p.filename,
            title,
            clientDurationS: p.durationS,
          });

      await logAudit(
        userId,
        p.trackId ? "track.audio_attached" : "track.uploaded",
        {
          trackId: result.trackId,
          filename: p.filename,
          durationS: result.durationS,
        },
      );
      // Auto-pipeline (ROADMAP C1.3): drop it in, walk away — the worker chains
      // transcribe → organize. Attaching audio to a shell kicks the same chain.
      if (await getSetting("auto_pipeline")) {
        await enqueue(
          "transcribe",
          { trackId: result.trackId },
          { dedupeKey: `transcribe:${result.trackId}` },
        );
      }
      return { trackId: result.trackId };
    },
  });
}
