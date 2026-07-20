import { extname } from "node:path";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { ingestUploadFromPath } from "@/lib/media/ingest";
import {
  ChunkError,
  parseChunkParams,
  receiveChunk,
} from "@/lib/media/chunked";
import { countMyUploads } from "@/lib/library/queries";
import { enqueue } from "@/lib/jobs/queue";
import { getSetting } from "@/lib/settings";
import { copy, fill } from "@/copy/copy";

/**
 * F1 — "subjects bring their own files", now chunked/resumable (the
 * Cloudflare-524 fix). A signed-in subject's file is sliced into ~5 MB parts and
 * POSTed sequentially; `chunked.ts` reassembles + integrity-checks it on disk,
 * then it becomes a PRIVATE track (ownerUserId = them, source "subject_upload",
 * draft) visible only to them and the goddess (D7), and enters the normal
 * transcribe → organize pipeline so it earns a transcript, tags, and a cover.
 *
 * Every failure still speaks in her voice; auth + the ownership scope are
 * re-checked on every chunk. Query params per chunk: uploadId, index, count,
 * filename, size, sha256, durationS.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Audio extensions we accept (mirrors ingest's ALLOWED_EXT). The extension is
 *  the gate — chunk bodies don't carry the original file's content-type. */
const AUDIO_EXT = new Set([".mp3", ".m4a", ".mp4", ".wav", ".aac", ".ogg"]);

/** A .m4a → "My session" style title from the raw filename. */
function cleanTitle(filename: string): string {
  const ext = extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
}

export async function POST(req: NextRequest) {
  // Re-checked on EVERY chunk — each chunk is its own POST. Owner scope is the
  // signed-in user; the upload is bound to their id below.
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const parsed = parseChunkParams(searchParams);
  if (!parsed.ok) return parsed.response;
  const params = parsed.value;

  const maxMb = await getSetting("subject_upload_max_mb");
  const maxBytes = Math.max(1, Math.round(maxMb)) * 1024 * 1024;

  return receiveChunk(req, params, {
    maxBytes, // the per-file ceiling, enforced exactly (declared size) + hard as bytes stream
    exposeErrors: false, // subject-facing — always speak in her voice
    errors: {
      tooLarge: { error: fill(copy.uploads.errors.tooLarge, { max: `${maxMb} MB` }) },
      corrupt: { error: copy.uploads.errors.notWhole },
      failed: { error: copy.uploads.errors.failed },
    },
    // All the F1 gates run once, on index 0, before any bytes are accepted. The
    // exact per-file size ceiling is handled generically by the helper (declared
    // size vs maxBytes), so it isn't repeated here.
    onStart: async (p) => {
      if (!(await getSetting("subject_uploads_enabled"))) {
        throw new ChunkError(403, { error: copy.uploads.errors.disabled });
      }
      const ext = extname(p.filename).toLowerCase();
      if (!AUDIO_EXT.has(ext)) {
        throw new ChunkError(415, { error: copy.uploads.errors.notAudio });
      }
      const maxFiles = await getSetting("subject_upload_max_files");
      const held = await countMyUploads(userId);
      if (held >= maxFiles) {
        throw new ChunkError(409, { error: copy.uploads.errors.tooMany });
      }
    },
    onFinalize: async (p, assembledPath) => {
      const result = await ingestUploadFromPath({
        path: assembledPath,
        filename: p.filename,
        title: cleanTitle(p.filename),
        clientDurationS: p.durationS,
        ownerUserId: userId,
        source: "subject_upload",
      });

      await logAudit(userId, "subject_upload.received", {
        trackId: result.trackId,
        filename: p.filename,
        durationS: result.durationS,
      });

      // Subject uploads always self-start: transcribe → (organize, per
      // auto_pipeline). organizeTrack skips the review queue for owned tracks;
      // the owner is pushed "It's ready for you." when it reaches `ready`.
      await enqueue(
        "transcribe",
        { trackId: result.trackId },
        { dedupeKey: `transcribe:${result.trackId}` },
      );

      return { trackId: result.trackId };
    },
  });
}
