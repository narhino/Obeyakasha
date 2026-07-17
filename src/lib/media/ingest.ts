import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { mediaProvider } from "@/lib/media";
import { probeDurationSeconds } from "./probe";

const ALLOWED_EXT = new Set([".mp3", ".m4a", ".mp4", ".wav", ".aac", ".ogg"]);

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "track"
  );
}

export async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  // Cheap uniqueness loop; collisions are rare at this scale.
  while (true) {
    const existing = await db
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.slug, slug))
      .limit(1);
    if (existing.length === 0) return slug;
    slug = `${base}-${++n}`;
  }
}

export interface IngestResult {
  trackId: string;
  durationS: number | null;
  streamKey: string;
}

/**
 * Ingest an uploaded audio file into a draft track (PLAN §7.2). ffmpeg-optional:
 * if ffprobe is present we read the duration; otherwise the caller's measured
 * duration (or admin edit) fills it. No transcode in dev — the original bytes
 * are the stream source; the prod worker container transcodes to AAC.
 */
export async function ingestUpload(params: {
  filename: string;
  bytes: Uint8Array;
  title?: string;
  clientDurationS?: number | null;
}): Promise<IngestResult> {
  const ext = extname(params.filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`Unsupported audio type: ${ext || "(none)"}`);
  }

  const title = params.title?.trim() || params.filename.replace(ext, "");
  const slug = await uniqueSlug(slugify(title));

  const [track] = await db
    .insert(tracks)
    .values({ title, slug, visibility: "draft", source: "upload" })
    .returning();
  const trackId = track!.id;

  const provider = mediaProvider();
  await provider.putOriginal(trackId, params.filename, params.bytes);
  const streamKey = await provider.putStream(trackId, params.bytes, ext);

  // Probe duration from a temp copy if ffprobe is available.
  let durationS = params.clientDurationS ?? null;
  const probed = await probeToTemp(params.bytes, ext);
  if (probed !== null) durationS = probed;

  await db
    .update(tracks)
    .set({
      streamKey,
      durationS: durationS ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(tracks.id, trackId));

  return { trackId, durationS, streamKey };
}

/**
 * Ingest from a file already streamed to disk (the /api/sanctum/upload route,
 * ROADMAP C1.2). Reads the temp file once and reuses the buffer-based path;
 * at real catalog sizes (tens of MB per session) this is well within memory.
 * A fully streaming provider write is a later optimization (see ROADMAP).
 */
export async function ingestUploadFromPath(params: {
  path: string;
  filename: string;
  title?: string;
  clientDurationS?: number | null;
}): Promise<IngestResult> {
  const { readFile } = await import("node:fs/promises");
  const bytes = new Uint8Array(await readFile(params.path));
  return ingestUpload({
    filename: params.filename,
    bytes,
    title: params.title,
    clientDurationS: params.clientDurationS ?? null,
  });
}

/**
 * Attach an uploaded audio file to an EXISTING (shell) track (ROADMAP-v1.5 R8).
 * Patreon imports arrive as audio-less shells; the bulk-attach screen streams
 * her real files onto them. Mirrors {@link ingestUpload}'s storage writes +
 * duration probe, but updates the track in place instead of inserting a new row
 * and resets the pipeline to `uploaded` so the auto-pipeline can chain from it.
 *
 * The caller (the upload route) MUST have verified the track exists and has no
 * `streamKey` yet — attaching over existing audio is refused there (409).
 */
export async function attachUploadToTrack(params: {
  trackId: string;
  path: string;
  filename: string;
  clientDurationS?: number | null;
}): Promise<IngestResult> {
  const ext = extname(params.filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`Unsupported audio type: ${ext || "(none)"}`);
  }

  const { readFile } = await import("node:fs/promises");
  const bytes = new Uint8Array(await readFile(params.path));

  const provider = mediaProvider();
  await provider.putOriginal(params.trackId, params.filename, bytes);
  const streamKey = await provider.putStream(params.trackId, bytes, ext);

  let durationS = params.clientDurationS ?? null;
  const probed = await probeToTemp(bytes, ext);
  if (probed !== null) durationS = probed;

  await db
    .update(tracks)
    .set({
      streamKey,
      durationS: durationS ?? undefined,
      pipeline: "uploaded",
      updatedAt: new Date(),
    })
    .where(eq(tracks.id, params.trackId));

  return { trackId: params.trackId, durationS, streamKey };
}

async function probeToTemp(
  bytes: Uint8Array,
  ext: string,
): Promise<number | null> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "akasha-ingest-"));
    const p = join(dir, `probe${ext}`);
    await writeFile(p, bytes);
    return await probeDurationSeconds(p);
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
