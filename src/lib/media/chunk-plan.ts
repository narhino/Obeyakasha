/**
 * Pure, isomorphic chunk-planning + assembly helpers (ROADMAP fix: chunked
 * resumable uploads). No Node or browser imports so the SAME logic runs in the
 * client uploader (`upload-client.ts`), the server assembler (`chunked.ts`), and
 * unit tests. Keeping it dependency-free is what makes the lossless path cheap
 * to prove (see `chunk-plan.test.ts`).
 */

export interface ChunkRange {
  index: number;
  /** Inclusive byte offset into the source file. */
  start: number;
  /** Exclusive byte offset (== source length for the last chunk). */
  end: number;
}

/**
 * Slice a file of `totalSize` bytes into contiguous, ordered, non-overlapping
 * ranges of at most `chunkSize` bytes each. Always returns at least one range so
 * a 0-byte file still forms a single (empty) part the server can finalize.
 */
export function planChunks(totalSize: number, chunkSize: number): ChunkRange[] {
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new Error("chunkSize must be a positive number");
  }
  const size = Math.max(0, Math.floor(totalSize));
  const count = Math.max(1, Math.ceil(size / chunkSize));
  const ranges: ChunkRange[] = [];
  for (let index = 0; index < count; index++) {
    const start = index * chunkSize;
    ranges.push({ index, start, end: Math.min(start + chunkSize, size) });
  }
  return ranges;
}

/**
 * Concatenate parts back into one buffer, in the order given. This is the pure
 * reference model for the server's streaming append: if the parts arrive in
 * order and intact, the result is byte-for-byte the original. Reordering or a
 * dropped part changes the bytes (and therefore the SHA-256) — which is exactly
 * what the finalize integrity gate catches.
 */
export function concatChunks(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
