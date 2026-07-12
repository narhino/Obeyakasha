import { describe, expect, it } from "vitest";
import { localDate, nextChainState, previousDay } from "./logic";

describe("previousDay", () => {
  it("goes back one day, crossing months", () => {
    expect(previousDay("2026-07-01")).toBe("2026-06-30");
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });
});

describe("nextChainState", () => {
  const base = { currentLen: 3, bestLen: 5, lastKeptDate: "2026-07-10" };

  it("keeping the same day is a no-op", () => {
    expect(nextChainState(base, "2026-07-10")).toEqual(base);
  });

  it("consecutive day extends the chain", () => {
    expect(nextChainState(base, "2026-07-11")).toEqual({
      currentLen: 4,
      bestLen: 5,
      lastKeptDate: "2026-07-11",
    });
  });

  it("a gap resets the chain to 1", () => {
    expect(nextChainState(base, "2026-07-13")).toEqual({
      currentLen: 1,
      bestLen: 5,
      lastKeptDate: "2026-07-13",
    });
  });

  it("beating the best updates bestLen", () => {
    const s = { currentLen: 5, bestLen: 5, lastKeptDate: "2026-07-10" };
    expect(nextChainState(s, "2026-07-11")).toEqual({
      currentLen: 6,
      bestLen: 6,
      lastKeptDate: "2026-07-11",
    });
  });

  it("first-ever keep starts at 1", () => {
    expect(
      nextChainState({ currentLen: 0, bestLen: 0, lastKeptDate: null }, "2026-07-11"),
    ).toEqual({ currentLen: 1, bestLen: 1, lastKeptDate: "2026-07-11" });
  });
});

describe("localDate", () => {
  it("formats YYYY-MM-DD in the given timezone", () => {
    // 2026-07-12T02:00Z is still 2026-07-11 in New York (UTC-4)
    const d = new Date("2026-07-12T02:00:00Z");
    expect(localDate(d, "America/New_York")).toBe("2026-07-11");
    expect(localDate(d, "UTC")).toBe("2026-07-12");
  });
});
