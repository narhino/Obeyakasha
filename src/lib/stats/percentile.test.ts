import { describe, expect, it } from "vitest";
import { obedienceScore, percentileRank } from "./percentile";

describe("obedienceScore", () => {
  it("sums hours, tasks, and chain at equal weight", () => {
    expect(obedienceScore(10, 3, 8)).toBe(21);
    expect(obedienceScore(0, 0, 0)).toBe(0);
  });
  it("keeps fractional hours", () => {
    expect(obedienceScore(10.5, 2, 1)).toBe(13.5);
  });
  it("clamps negatives and non-finite inputs to zero", () => {
    expect(obedienceScore(-4, 3, 2)).toBe(5);
    expect(obedienceScore(Number.NaN, 2, 1)).toBe(3);
    expect(obedienceScore(Infinity, 0, 0)).toBe(0);
  });
});

describe("percentileRank", () => {
  it("single user (no others) has no standing → 0", () => {
    expect(percentileRank(5, [])).toBe(0);
  });

  it("beats everyone strictly below → 100", () => {
    expect(percentileRank(10, [1, 2, 3, 4])).toBe(100);
  });

  it("beats no one → 0", () => {
    expect(percentileRank(0, [1, 2, 3])).toBe(0);
  });

  it("ties do NOT count as 'more than'", () => {
    // Everyone equal — beats none of them.
    expect(percentileRank(5, [5, 5, 5])).toBe(0);
    // One below, one equal, one above → only the strictly-lower counts.
    expect(percentileRank(5, [1, 5, 9])).toBe(33);
  });

  it("rounds the share to a whole percent", () => {
    // 4 of 7 strictly below → 57.14% → 57.
    expect(percentileRank(5, [1, 2, 3, 4, 5, 6, 7])).toBe(57);
  });

  it("mixes ties and strict-belows correctly", () => {
    // Below: 1,2,3,4 (4). Equal: 5,5 (excluded). Above: 6 → 4/7 → 57.
    expect(percentileRank(5, [1, 2, 3, 4, 5, 5, 6])).toBe(57);
  });
});
