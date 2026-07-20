import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { concatChunks, planChunks } from "./chunk-plan";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("planChunks", () => {
  it("produces contiguous, ordered, gap-free ranges covering the whole file", () => {
    const ranges = planChunks(23, 10);
    expect(ranges.map((r) => [r.start, r.end])).toEqual([
      [0, 10],
      [10, 20],
      [20, 23],
    ]);
    expect(ranges.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it("always yields at least one (possibly empty) part, even for 0 bytes", () => {
    expect(planChunks(0, 10)).toEqual([{ index: 0, start: 0, end: 0 }]);
  });

  it("is exact on a chunk-size boundary", () => {
    expect(planChunks(20, 10).length).toBe(2);
  });
});

describe("concatChunks (lossless assembly)", () => {
  it("reassembles 3 in-order chunks byte-for-byte, hash included", () => {
    // A 23-byte source split into 3 parts per the plan.
    const original = new Uint8Array(23);
    for (let i = 0; i < original.length; i++) original[i] = (i * 37 + 5) & 0xff;

    const parts = planChunks(original.length, 10).map((r) =>
      original.slice(r.start, r.end),
    );
    expect(parts.length).toBe(3);

    const assembled = concatChunks(parts);
    expect(assembled).toEqual(original);
    // The cheap proof the transport is lossless: same bytes → same SHA-256.
    expect(sha(assembled)).toBe(sha(original));
  });

  it("a reordered part changes the hash (the integrity gate would reject)", () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const parts = planChunks(original.length, 2).map((r) =>
      original.slice(r.start, r.end),
    );
    const swapped = concatChunks([parts[1]!, parts[0]!, parts[2]!]);
    expect(sha(swapped)).not.toBe(sha(original));
  });
});
