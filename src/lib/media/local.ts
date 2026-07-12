import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { env } from "@/lib/env";
import { makeStreamToken } from "./sign";
import type { MediaProvider, ReadResult } from "./provider";

/**
 * Local filesystem media provider (dev/test). Files live under MEDIA_LOCAL_DIR.
 * signStreamUrl returns an app route (/api/stream/...) that proxies bytes with
 * HTTP Range support — the same URL contract the client uses against Bunny.
 */
const ROOT = resolve(process.env.MEDIA_LOCAL_DIR ?? "./media-local");

function keyToPath(key: string): string {
  // Prevent path traversal: the resolved path must stay under ROOT.
  const p = normalize(join(ROOT, key));
  if (!p.startsWith(ROOT)) throw new Error("invalid media key");
  return p;
}

async function write(key: string, bytes: Uint8Array): Promise<string> {
  const path = keyToPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return key;
}

function contentTypeFor(key: string): string {
  if (key.endsWith(".m4a") || key.endsWith(".mp4")) return "audio/mp4";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".wav")) return "audio/wav";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

/** Parse "bytes=start-end" against a known size. */
export function parseRange(
  header: string | null | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, s, e] = m;
  let start = s ? parseInt(s, 10) : NaN;
  let end = e ? parseInt(e, 10) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    // suffix range: last N bytes
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (start > end || start < 0 || end >= size) return null;
  return { start, end };
}

export class LocalMediaProvider implements MediaProvider {
  readonly kind = "local" as const;

  putOriginal(trackId: string, filename: string, bytes: Uint8Array) {
    return write(`originals/${trackId}/${filename}`, bytes);
  }
  putStream(trackId: string, bytes: Uint8Array, ext: string) {
    return write(`stream/${trackId}${ext}`, bytes);
  }
  putArtwork(trackId: string, bytes: Uint8Array) {
    return write(`art/${trackId}.webp`, bytes);
  }

  async signStreamUrl(streamKey: string, ttlSeconds: number): Promise<string> {
    const { token, exp } = makeStreamToken(streamKey, ttlSeconds);
    const u = new URL("/api/stream", env.APP_ORIGIN);
    u.searchParams.set("key", streamKey);
    u.searchParams.set("exp", String(exp));
    u.searchParams.set("token", token);
    return u.toString();
  }

  async readStream(
    streamKey: string,
    range?: string | null,
  ): Promise<ReadResult> {
    const path = keyToPath(streamKey);
    const info = await stat(path);
    const size = info.size;
    const contentType = contentTypeFor(streamKey);
    const parsed = parseRange(range, size);
    if (parsed) {
      const node = createReadStream(path, {
        start: parsed.start,
        end: parsed.end,
      });
      return {
        body: Readable.toWeb(node) as ReadableStream<Uint8Array>,
        size,
        contentType,
        range: parsed,
      };
    }
    const node = createReadStream(path);
    return {
      body: Readable.toWeb(node) as ReadableStream<Uint8Array>,
      size,
      contentType,
    };
  }

  async readBytes(key: string): Promise<Uint8Array> {
    const { readFile } = await import("node:fs/promises");
    return new Uint8Array(await readFile(keyToPath(key)));
  }

  async delete(key: string): Promise<void> {
    await rm(keyToPath(key), { force: true });
  }
}
