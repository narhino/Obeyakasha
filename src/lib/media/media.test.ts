import { describe, expect, it } from "vitest";
import { parseRange } from "./local";
import { makeStreamToken, verifyStreamToken } from "./sign";

describe("parseRange", () => {
  const size = 1000;
  it("returns null without a header", () => {
    expect(parseRange(null, size)).toBeNull();
    expect(parseRange(undefined, size)).toBeNull();
  });
  it("parses a full closed range", () => {
    expect(parseRange("bytes=0-499", size)).toEqual({ start: 0, end: 499 });
  });
  it("parses an open-ended range to EOF", () => {
    expect(parseRange("bytes=500-", size)).toEqual({ start: 500, end: 999 });
  });
  it("parses a suffix range (last N bytes)", () => {
    expect(parseRange("bytes=-100", size)).toEqual({ start: 900, end: 999 });
  });
  it("rejects out-of-bounds and inverted ranges", () => {
    expect(parseRange("bytes=999-1000", size)).toBeNull();
    expect(parseRange("bytes=600-500", size)).toBeNull();
    expect(parseRange("bytes=abc-def", size)).toBeNull();
  });
});

describe("stream token", () => {
  it("verifies a fresh token", () => {
    const key = "stream/abc.m4a";
    const { token, exp } = makeStreamToken(key, 3600);
    expect(verifyStreamToken(key, exp, token)).toBe(true);
  });
  it("rejects a tampered key", () => {
    const { token, exp } = makeStreamToken("stream/abc.m4a", 3600);
    expect(verifyStreamToken("stream/other.m4a", exp, token)).toBe(false);
  });
  it("rejects an expired token", () => {
    const key = "stream/abc.m4a";
    const { token } = makeStreamToken(key, 3600);
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    expect(verifyStreamToken(key, pastExp, token)).toBe(false);
  });
  it("rejects a garbage token", () => {
    const { exp } = makeStreamToken("stream/abc.m4a", 3600);
    expect(verifyStreamToken("stream/abc.m4a", exp, "deadbeef")).toBe(false);
  });
});
