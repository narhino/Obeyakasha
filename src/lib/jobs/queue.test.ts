import { describe, expect, it } from "vitest";
import { BACKOFF_MS, nextBackoffMs } from "./queue";

describe("nextBackoffMs", () => {
  it("returns the first delay after the first failed attempt", () => {
    expect(nextBackoffMs(1)).toBe(BACKOFF_MS[0]);
  });

  it("steps through the schedule by attempt number", () => {
    expect(nextBackoffMs(2)).toBe(BACKOFF_MS[1]);
    expect(nextBackoffMs(3)).toBe(BACKOFF_MS[2]);
  });

  it("clamps to the last delay for further attempts", () => {
    const last = BACKOFF_MS[BACKOFF_MS.length - 1];
    expect(nextBackoffMs(4)).toBe(last);
    expect(nextBackoffMs(99)).toBe(last);
  });

  it("never returns a negative index for zero/garbage attempts", () => {
    expect(nextBackoffMs(0)).toBe(BACKOFF_MS[0]);
    expect(nextBackoffMs(-5)).toBe(BACKOFF_MS[0]);
  });

  it("schedule is strictly increasing (real backoff)", () => {
    for (let i = 1; i < BACKOFF_MS.length; i++) {
      expect(BACKOFF_MS[i]!).toBeGreaterThan(BACKOFF_MS[i - 1]!);
    }
  });
});
