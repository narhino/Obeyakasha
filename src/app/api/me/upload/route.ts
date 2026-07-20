import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { ingestUploadFromPath } from "@/lib/media/ingest";
import { countMyUploads } from "@/lib/library/queries";
import { enqueue } from "@/lib/jobs/queue";
import { getSetting } from "@/lib/settings";
import { copy, fill } from "@/copy/copy";

/**
 * F1 — "subjects bring their own files". A signed-in subject streams ONE audio
 * file of their own here; it becomes a PRIVATE track (ownerUserId = them,
 * source "subject_upload", draft) visible only to them and the goddess (D7), and
 * enters the normal transcribe → organize pipeline so it earns a transcript,
 * tags, and a default cover automatically.
 *
 * Modelled on /api/sanctum/upload: the file is the raw request body (not
 * multipart) so the browser's XHR upload.onprogress drives a real progress bar.
 * The body is size-capped as it streams (bounded memory + storage) and every
 * failure speaks in her voice. Query param: filename (required), durationS.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A .m4a → "My session" style title from the raw filename. */
function cleanTitle(filename: string): string {
  const ext = extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
}

/** Stream Transform that aborts the moment the body exceeds `maxBytes`. */
function byteCap(maxBytes: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length;
      if (seen > maxBytes) {
        cb(new Error("too_large"));
        return;
      }
      cb(null, chunk);
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Gate 1: is she taking their files at all?
  if (!(await getSetting("subject_uploads_enabled"))) {
    return Response.json(
      { error: copy.uploads.errors.disabled },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename");
  if (!filename) {
    return Response.json(
      { error: copy.uploads.errors.empty },
      { status: 400 },
    );
  }

  // Gate 2: audio/* mime + extension sniff (both, per spec).
  const ext = extname(filename).toLowerCase();
  const AUDIO_EXT = new Set([".mp3", ".m4a", ".mp4", ".wav", ".aac", ".ogg"]);
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  const mimeOk =
    ct === "" || ct === "application/octet-stream" || ct.startsWith("audio/");
  if (!AUDIO_EXT.has(ext) || !mimeOk) {
    return Response.json(
      { error: copy.uploads.errors.notAudio },
      { status: 415 },
    );
  }

  // Gate 3: per-subject ceiling — count their existing (non-deleted) uploads.
  const [maxFiles, maxMb] = await Promise.all([
    getSetting("subject_upload_max_files"),
    getSetting("subject_upload_max_mb"),
  ]);
  const held = await countMyUploads(userId);
  if (held >= maxFiles) {
    return Response.json(
      { error: copy.uploads.errors.tooMany },
      { status: 409 },
    );
  }

  // Gate 4: per-file size ceiling. Fast-fail on Content-Length, then enforce
  // hard as the bytes actually stream (a spoofed/absent header can't get past).
  const maxBytes = Math.max(1, Math.round(maxMb)) * 1024 * 1024;
  const tooLarge = () =>
    Response.json(
      { error: fill(copy.uploads.errors.tooLarge, { max: `${maxMb} MB` }) },
      { status: 413 },
    );
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge();

  if (!req.body) {
    return Response.json({ error: copy.uploads.errors.empty }, { status: 400 });
  }

  const durationRaw = searchParams.get("durationS");
  const durationNum =
    durationRaw && durationRaw !== "" ? Math.round(Number(durationRaw)) : null;
  const clientDurationS = Number.isFinite(durationNum as number)
    ? durationNum
    : null;

  const dir = await mkdtemp(join(tmpdir(), "akasha-me-upload-"));
  const tmpPath = join(dir, "upload.bin");
  try {
    await pipeline(
      Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]),
      byteCap(maxBytes),
      createWriteStream(tmpPath),
    );

    const result = await ingestUploadFromPath({
      path: tmpPath,
      filename,
      title: cleanTitle(filename),
      clientDurationS,
      ownerUserId: userId,
      source: "subject_upload",
    });

    await logAudit(userId, "subject_upload.received", {
      trackId: result.trackId,
      filename,
      durationS: result.durationS,
    });

    // Subject uploads have no manual pipeline control, so they always self-start:
    // transcribe → (organize, per auto_pipeline) so they earn a transcript, tags,
    // and a cover. organizeTrack skips the review queue for owned tracks; the
    // owner is pushed "It's ready for you." when it reaches `ready`.
    await enqueue(
      "transcribe",
      { trackId: result.trackId },
      { dedupeKey: `transcribe:${result.trackId}` },
    );

    return Response.json({ trackId: result.trackId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "too_large") return tooLarge();
    return Response.json(
      { error: copy.uploads.errors.failed },
      { status: 400 },
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
