import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { NextRequest } from "next/server";
import { z } from "zod";

/**
 * Chunked / resumable upload assembly (the Cloudflare-524 fix). Both upload
 * routes (`/api/sanctum/upload`, `/api/me/upload`) delegate here so the browser
 * can slice a file into small parts, each its own short request — well under
 * Cloudflare's 100 s origin timeout and 100 MB body cap — which we reassemble
 * on disk and hand, whole, to the existing ingest pipeline.
 *
 * This module owns only the TRANSPORT concern: per-`uploadId` temp file, strict
 * in-order append, a streaming byte ceiling, a finalize-time size + SHA-256
 * integrity gate, and cleanup. Each route owns its own auth, fast-fail
 * validations (via `onStart`), and ingest/attach + audit + enqueue (via
 * `onFinalize`). Bounded memory throughout: chunks are streamed to disk and the
 * hash is computed by streaming the file, never by buffering it.
 */

/** Absolute ceiling on the client-declared total size (zod bound only; each
 *  route enforces its real limit via `maxBytes`). */
const MAX_DECLARED_SIZE = 10 * 1024 * 1024 * 1024;

/** Abandoned partial uploads older than this are swept on the next upload start. */
const STALE_MS = 6 * 60 * 60 * 1000;

const ASSEMBLED = "assembled.bin";
const META = "meta.json";

/** Root for all in-flight assemblies. Local to this origin — chunk N must reach
 *  the same origin as chunk N-1 (true for the single-origin-behind-Cloudflare
 *  deployment; a multi-instance origin would need shared scratch storage). */
function chunkRoot(): string {
  return join(tmpdir(), "akasha-chunked");
}

/**
 * Fast-fail signal from a route's `onStart`/`onFinalize` hook: a specific HTTP
 * status + JSON body (in Akasha's voice for F1, plain for the Sanctum).
 */
export class ChunkError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body.error === "string" ? body.error : "chunk error");
    this.name = "ChunkError";
  }
}

export interface ChunkParams {
  uploadId: string;
  index: number;
  count: number;
  filename: string;
  /** Client-declared exact total byte length of the whole file. */
  size: number;
  /** Client-declared lowercase hex SHA-256 of the whole file. */
  sha256: string;
  durationS: number | null;
  trackId: string | null;
}

interface ChunkMeta {
  /** The user id this assembly belongs to (see {@link ChunkHooks.owner}). */
  owner: string;
  received: number;
  count: number;
  filename: string;
  size: number;
  sha256: string;
  durationS: number | null;
  trackId: string | null;
}

export interface ChunkHooks {
  /**
   * The authenticated caller this assembly belongs to. `uploadId` is chosen by
   * the client, so the owner is recorded on the first chunk and re-checked on
   * every later one: nobody can append bytes into — or restart — an assembly
   * that isn't theirs.
   */
  owner: string;
  /** Hard server-side ceiling for this upload's assembled size. */
  maxBytes: number;
  /** Bodies for helper-generated failures — copy lives in the routes, not here. */
  errors: {
    tooLarge: Record<string, unknown>;
    corrupt: Record<string, unknown>;
    failed: Record<string, unknown>;
  };
  /** Surface raw error messages (Sanctum, goddess-only) vs. the in-voice
   *  `errors.failed` (F1, subject-facing). */
  exposeErrors?: boolean;
  /** Runs once on index 0, BEFORE any bytes are accepted. Throw a
   *  {@link ChunkError} to reject fast (bad role, missing target, over cap, …). */
  onStart?: (p: ChunkParams, req: NextRequest) => Promise<void>;
  /** Runs once on the final chunk with the assembled temp path. Does the
   *  ingest/attach + audit + enqueue and returns the created/updated track id. */
  onFinalize: (
    p: ChunkParams,
    assembledPath: string,
  ) => Promise<{ trackId: string }>;
}

const QuerySchema = z
  .object({
    uploadId: z.string().uuid(),
    index: z.coerce.number().int().min(0).max(1_000_000),
    count: z.coerce.number().int().min(1).max(1_000_000),
    filename: z.string().min(1).max(1024),
    size: z.coerce.number().int().min(0).max(MAX_DECLARED_SIZE),
    sha256: z.string().regex(/^[0-9a-f]{64}$/i),
    trackId: z.string().uuid().nullish(),
    durationS: z.coerce.number().int().min(0).nullish(),
  })
  .refine((v) => v.index < v.count, { message: "index >= count" });

/**
 * Parse + zod-validate the chunk query params. `uploadId` MUST be a uuid — the
 * temp path is derived from it alone (never from the filename), so there is no
 * path-traversal surface.
 */
export function parseChunkParams(
  sp: URLSearchParams,
): { ok: true; value: ChunkParams } | { ok: false; response: Response } {
  const durationRaw = sp.get("durationS");
  const raw = {
    uploadId: sp.get("uploadId") ?? undefined,
    index: sp.get("index") ?? undefined,
    count: sp.get("count") ?? undefined,
    filename: sp.get("filename") ?? undefined,
    size: sp.get("size") ?? undefined,
    sha256: sp.get("sha256") ?? undefined,
    trackId: sp.get("trackId") ?? undefined,
    durationS: durationRaw && durationRaw !== "" ? durationRaw : undefined,
  };
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json({ error: "bad request" }, { status: 400 }),
    };
  }
  const v = parsed.data;
  return {
    ok: true,
    value: {
      uploadId: v.uploadId,
      index: v.index,
      count: v.count,
      filename: v.filename,
      size: v.size,
      sha256: v.sha256.toLowerCase(),
      trackId: v.trackId ?? null,
      durationS: v.durationS ?? null,
    },
  };
}

async function readMeta(path: string): Promise<ChunkMeta | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ChunkMeta;
  } catch {
    return null;
  }
}

async function writeMeta(path: string, meta: ChunkMeta): Promise<void> {
  await writeFile(path, JSON.stringify(meta));
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

/** Streamed SHA-256 of a file — bounded memory, never buffers the whole file. */
async function fileSha256Hex(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/**
 * Append one chunk's request body to the assembled file, aborting the moment the
 * running total would exceed `maxBytes`. On any failure the file is truncated
 * back to `priorSize` so a retried chunk re-appends from a clean boundary.
 */
async function appendChunk(
  body: NonNullable<NextRequest["body"]>,
  path: string,
  maxBytes: number,
  priorSize: number,
): Promise<void> {
  let seen = 0;
  const cap = new Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length;
      if (priorSize + seen > maxBytes) {
        cb(new Error("too_large"));
        return;
      }
      cb(null, chunk);
    },
  });
  const source = Readable.fromWeb(
    body as Parameters<typeof Readable.fromWeb>[0],
  );
  try {
    await pipeline(source, cap, createWriteStream(path, { flags: "a" }));
  } catch (err) {
    await truncate(path, priorSize).catch(() => {});
    throw err;
  }
}

/** Best-effort sweep of assemblies abandoned mid-upload. Runs on upload start. */
async function sweepStale(root: string): Promise<void> {
  const cutoff = Date.now() - STALE_MS;
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (name) => {
      const p = join(root, name);
      try {
        if ((await stat(p)).mtimeMs < cutoff) {
          await rm(p, { recursive: true, force: true });
        }
      } catch {
        /* ignore */
      }
    }),
  );
}

/**
 * Receive one chunk. Drives the whole protocol: index-0 (re)init + gate, strict
 * in-order append with a byte ceiling, and — on the final chunk — a size +
 * SHA-256 integrity gate before ingest. Cleans up the temp dir on finalize and
 * on any hard error; keeps it between chunks so the next one can append.
 */
export async function receiveChunk(
  req: NextRequest,
  params: ChunkParams,
  hooks: ChunkHooks,
): Promise<Response> {
  const root = chunkRoot();
  const dir = join(root, params.uploadId);
  const assembled = join(dir, ASSEMBLED);
  const metaPath = join(dir, META);
  const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});

  const failBody = (): Record<string, unknown> => hooks.errors.failed;

  try {
    if (params.index === 0) {
      await mkdir(root, { recursive: true });
      await sweepStale(root);
      // An id already in flight for someone else is refused, not wiped.
      const prior = await readMeta(metaPath);
      if (prior && prior.owner !== hooks.owner) {
        return Response.json(failBody(), { status: 409 });
      }
      // Fresh start (also absorbs an index-0 retry after a lost response): wipe
      // any prior state for this id before re-gating.
      await cleanup();

      // Exact declared-size ceiling — fast-fail before we accept a single byte.
      if (params.size > hooks.maxBytes) {
        return Response.json(hooks.errors.tooLarge, { status: 413 });
      }
      if (hooks.onStart) {
        try {
          await hooks.onStart(params, req);
        } catch (err) {
          if (err instanceof ChunkError) {
            return Response.json(err.body, { status: err.status });
          }
          throw err;
        }
      }
      await mkdir(dir, { recursive: true });
      await writeMeta(metaPath, {
        owner: hooks.owner,
        received: 0,
        count: params.count,
        filename: params.filename,
        size: params.size,
        sha256: params.sha256,
        durationS: params.durationS,
        trackId: params.trackId,
      });
    }

    const meta = await readMeta(metaPath);
    if (!meta) {
      // A non-first chunk with no active assembly (never started, or swept).
      return Response.json(failBody(), { status: 409 });
    }
    // Only the caller who started this assembly may add to it.
    if (meta.owner !== hooks.owner) {
      return Response.json(failBody(), { status: 409 });
    }
    // Strict ordering guard: the client retries the RIGHT chunk, so anything
    // other than the next-expected index (or a count that drifted) is refused.
    if (params.index !== meta.received || params.count !== meta.count) {
      return Response.json(failBody(), { status: 409 });
    }
    if (!req.body) {
      await cleanup();
      return Response.json(failBody(), { status: 400 });
    }

    const priorSize = params.index === 0 ? 0 : await sizeOf(assembled);
    try {
      await appendChunk(req.body, assembled, hooks.maxBytes, priorSize);
    } catch (err) {
      if (err instanceof Error && err.message === "too_large") {
        await cleanup();
        return Response.json(hooks.errors.tooLarge, { status: 413 });
      }
      // Transient write/stream failure (e.g. the body was cut mid-flight). Keep
      // the committed state — appendChunk already rolled the file back — and let
      // the client retry this same chunk (5xx is retryable client-side).
      return Response.json(failBody(), { status: 500 });
    }

    meta.received = params.index + 1;
    await writeMeta(metaPath, meta);

    if (params.index < meta.count - 1) {
      return Response.json({ received: meta.received });
    }

    // Final chunk — the bytes are all here. Prove the assembled file is exactly
    // the original before it ever touches ingest; a mismatch fails loud + cleans
    // up and NEVER ingests.
    const finalSize = await sizeOf(assembled);
    if (finalSize !== meta.size) {
      await cleanup();
      return Response.json(hooks.errors.corrupt, { status: 422 });
    }
    if ((await fileSha256Hex(assembled)) !== meta.sha256) {
      await cleanup();
      return Response.json(hooks.errors.corrupt, { status: 422 });
    }

    try {
      const result = await hooks.onFinalize(
        {
          uploadId: params.uploadId,
          index: params.index,
          count: meta.count,
          filename: meta.filename,
          size: meta.size,
          sha256: meta.sha256,
          durationS: meta.durationS,
          trackId: meta.trackId,
        },
        assembled,
      );
      return Response.json(result);
    } catch (err) {
      if (err instanceof ChunkError) {
        return Response.json(err.body, { status: err.status });
      }
      if (hooks.exposeErrors) {
        const message = err instanceof Error ? err.message : "upload failed";
        return Response.json({ error: message }, { status: 400 });
      }
      return Response.json(failBody(), { status: 400 });
    } finally {
      await cleanup();
    }
  } catch (err) {
    await cleanup();
    if (hooks.exposeErrors) {
      const message = err instanceof Error ? err.message : "upload failed";
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json(failBody(), { status: 400 });
  }
}
