import { describe, expect, it } from "vitest";
import { isWithinQuietHours, localHour } from "./quiet";

// 2026-07-12T04:00:00Z → 00:00 in New York (EDT, UTC-4), 06:00 in Berlin (UTC+2)
const NIGHT_UTC = new Date("2026-07-12T04:00:00Z");
// 2026-07-12T18:00:00Z → 14:00 New York, 20:00 Berlin
const DAY_UTC = new Date("2026-07-12T18:00:00Z");

describe("localHour", () => {
  it("computes the local hour per timezone", () => {
    expect(localHour(NIGHT_UTC, "America/New_York")).toBe(0);
    expect(localHour(NIGHT_UTC, "Europe/Berlin")).toBe(6);
  });
  it("returns null for an invalid timezone", () => {
    expect(localHour(NIGHT_UTC, "Not/AZone")).toBeNull();
  });
});

describe("isWithinQuietHours (wrapping window 22→9)", () => {
  it("midnight in NY is inside the window", () => {
    expect(isWithinQuietHours(NIGHT_UTC, "America/New_York", 22, 9)).toBe(true);
  });
  it("2pm in NY is outside the window", () => {
    expect(isWithinQuietHours(DAY_UTC, "America/New_York", 22, 9)).toBe(false);
  });
  it("6am in Berlin is inside the window", () => {
    expect(isWithinQuietHours(NIGHT_UTC, "Europe/Berlin", 22, 9)).toBe(true);
  });
  it("8pm in Berlin is outside the window", () => {
    expect(isWithinQuietHours(DAY_UTC, "Europe/Berlin", 22, 9)).toBe(false);
  });
});

describe("isWithinQuietHours (non-wrapping window 1→5)", () => {
  it("00:00 NY is outside 1..5", () => {
    expect(isWithinQuietHours(NIGHT_UTC, "America/New_York", 1, 5)).toBe(false);
  });
  it("06:00 Berlin is outside 1..5", () => {
    expect(isWithinQuietHours(NIGHT_UTC, "Europe/Berlin", 1, 5)).toBe(false);
  });
});

describe("edge cases", () => {
  it("empty window (start==end) is never quiet", () => {
    expect(isWithinQuietHours(NIGHT_UTC, "America/New_York", 9, 9)).toBe(false);
  });
  it("invalid timezone is treated as not quiet (send)", () => {
    expect(isWithinQuietHours(NIGHT_UTC, "Bad/Zone", 22, 9)).toBe(false);
  });
});
