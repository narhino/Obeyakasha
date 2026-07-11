import { describe, expect, it } from "vitest";
import { computeGates } from "./gating";

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("computeGates", () => {
  it("open: everything unlocked", () => {
    const g = computeGates(
      "open",
      [{ index: 0 }, { index: 1 }, { index: 2 }],
      NOW,
    );
    expect(g.every((x) => x.unlocked)).toBe(true);
  });

  it("sequential: only the first is unlocked initially", () => {
    const g = computeGates(
      "sequential",
      [{ index: 0 }, { index: 1 }, { index: 2 }],
      NOW,
    );
    expect(g.map((x) => x.unlocked)).toEqual([true, false, false]);
  });

  it("sequential: completing item 0 unlocks item 1 immediately", () => {
    const g = computeGates(
      "sequential",
      [{ index: 0, completedAt: NOW - 60_000 }, { index: 1 }, { index: 2 }],
      NOW,
    );
    expect(g.map((x) => x.unlocked)).toEqual([true, true, false]);
  });

  it("daily: item 1 stays locked until 24h after item 0 completion", () => {
    const g = computeGates(
      "daily",
      [{ index: 0, completedAt: NOW - 60_000 }, { index: 1 }],
      NOW,
    );
    expect(g[1]!.unlocked).toBe(false);
    expect(g[1]!.unlocksAt).toBe(NOW - 60_000 + DAY);
  });

  it("daily: item 1 unlocks once 24h has elapsed", () => {
    const completedAt = NOW - DAY - 1000;
    const g = computeGates(
      "daily",
      [{ index: 0, completedAt }, { index: 1 }],
      NOW,
    );
    expect(g[1]!.unlocked).toBe(true);
  });

  it("first item is always available regardless of gating", () => {
    for (const gating of ["sequential", "daily"] as const) {
      const g = computeGates(gating, [{ index: 0 }], NOW);
      expect(g[0]!.unlocked).toBe(true);
    }
  });

  it("handles out-of-order input by sorting on index", () => {
    const g = computeGates(
      "sequential",
      [{ index: 2 }, { index: 0, completedAt: NOW }, { index: 1 }],
      NOW,
    );
    // sorted: 0 (done) → 1 unlocked → 2 locked
    expect(g).toEqual([
      { index: 0, unlocked: true },
      { index: 1, unlocked: true },
      { index: 2, unlocked: false },
    ]);
  });
});
