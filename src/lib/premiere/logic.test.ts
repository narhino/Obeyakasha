import { describe, expect, it } from "vitest";
import { isPremiereSealed, parsePremiereInput, premiereDue } from "./logic";

const NOW = new Date("2026-07-17T12:00:00Z");
const FUTURE = new Date("2026-07-19T12:00:00Z");
const PAST = new Date("2026-07-15T12:00:00Z");

describe("isPremiereSealed", () => {
  it("a null premiere never seals — plays like any track", () => {
    expect(isPremiereSealed(null, NOW)).toBe(false);
    expect(isPremiereSealed(undefined, NOW)).toBe(false);
  });

  it("seals while the premiere is still ahead", () => {
    expect(isPremiereSealed(FUTURE, NOW)).toBe(true);
  });

  it("unseals once the moment has passed", () => {
    expect(isPremiereSealed(PAST, NOW)).toBe(false);
  });

  it("is unsealed exactly at the premiere instant (not strictly future)", () => {
    expect(isPremiereSealed(NOW, NOW)).toBe(false);
  });

  it("accepts an ISO string (RSC-serialized dates)", () => {
    expect(isPremiereSealed(FUTURE.toISOString(), NOW)).toBe(true);
    expect(isPremiereSealed(PAST.toISOString(), NOW)).toBe(false);
  });

  it("a malformed timestamp never seals", () => {
    expect(isPremiereSealed("not-a-date", NOW)).toBe(false);
  });
});

describe("premiereDue", () => {
  it("false when there is no premiere", () => {
    expect(premiereDue(null, null, NOW)).toBe(false);
  });

  it("false while the premiere is still in the future", () => {
    expect(premiereDue(FUTURE, null, NOW)).toBe(false);
  });

  it("true once due and not yet announced", () => {
    expect(premiereDue(PAST, null, NOW)).toBe(true);
    expect(premiereDue(NOW, null, NOW)).toBe(true);
  });

  it("false once already announced (fires exactly once)", () => {
    expect(premiereDue(PAST, PAST, NOW)).toBe(false);
  });
});

describe("parsePremiereInput", () => {
  it("empty / whitespace → null", () => {
    expect(parsePremiereInput("")).toBeNull();
    expect(parsePremiereInput("   ")).toBeNull();
    expect(parsePremiereInput(null)).toBeNull();
    expect(parsePremiereInput(undefined)).toBeNull();
  });

  it("reads a minute-precision datetime-local as UTC", () => {
    const d = parsePremiereInput("2026-07-20T14:30");
    expect(d?.toISOString()).toBe("2026-07-20T14:30:00.000Z");
  });

  it("reads a second-precision value as UTC", () => {
    const d = parsePremiereInput("2026-07-20T14:30:15");
    expect(d?.toISOString()).toBe("2026-07-20T14:30:15.000Z");
  });

  it("round-trips a stored ISO sliced back into the input", () => {
    const stored = "2026-12-01T09:05:00.000Z";
    const d = parsePremiereInput(stored.slice(0, 16));
    expect(d?.toISOString()).toBe("2026-12-01T09:05:00.000Z");
  });

  it("throws on a malformed value", () => {
    expect(() => parsePremiereInput("nonsense")).toThrow();
  });
});
