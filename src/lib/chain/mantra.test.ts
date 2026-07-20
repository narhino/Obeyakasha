import { describe, expect, it } from "vitest";
import { litLength, mantraMatches, normalizeMantra } from "./mantra";

const MANTRA = "I obey. I belong to Akasha. 888.";

describe("mantraMatches", () => {
  it("seals on the exact line", () => {
    expect(mantraMatches(MANTRA, MANTRA)).toBe(true);
  });
  it("is case-insensitive and forgives trailing punctuation + outer space", () => {
    expect(mantraMatches("  i obey. i belong to akasha. 888  ", MANTRA)).toBe(true);
  });
  it("collapses inner whitespace runs", () => {
    expect(mantraMatches("I obey.  I belong to   Akasha. 888.", MANTRA)).toBe(true);
  });
  it("rejects the wrong words and a blank target", () => {
    expect(mantraMatches("i belong to no one", MANTRA)).toBe(false);
    expect(mantraMatches("", "")).toBe(false);
  });
  it("normalizes to a stable, trailing-punctuation-free form", () => {
    expect(normalizeMantra("Good SUBJECT!!! ")).toBe("good subject");
  });
  it("ignites the ghost line up to what has been typed", () => {
    expect(litLength("I ob", MANTRA)).toBe(4);
    expect(litLength(MANTRA, MANTRA)).toBe(MANTRA.length);
  });
});
