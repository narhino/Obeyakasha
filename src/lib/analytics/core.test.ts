import { describe, expect, it } from "vitest";
import {
  DWELL_MAX_MS,
  barPct,
  clampDwell,
  clockS,
  deviceFromUa,
  fillDays,
  humanMs,
  isoDay,
  normalizePath,
  normalizeReferrerHost,
  parseRange,
  pct,
  rangeStart,
} from "./core";

/**
 * The pure half of first-party analytics. `normalizePath` and
 * `normalizeReferrerHost` are the privacy boundary — everything that reaches the
 * `page_views` table passes through them — so most of this file is about what
 * they REFUSE to store.
 */

describe("normalizePath", () => {
  it("keeps known static routes verbatim", () => {
    for (const p of ["/", "/signin", "/library", "/me", "/commissions"]) {
      expect(normalizePath(p)).toBe(p);
    }
  });

  it("maps dynamic segments to their route pattern", () => {
    expect(normalizePath("/library/track/deep-surrender")).toBe(
      "/library/track/[slug]",
    );
    expect(
      normalizePath("/library/series/8f1c2d0e-1111-4222-8333-444455556666"),
    ).toBe("/library/series/[id]");
    expect(normalizePath("/messages/abc123")).toBe("/messages/[id]");
    expect(normalizePath("/messages")).toBe("/messages");
  });

  it("collapses the whole Sanctum to one marker", () => {
    expect(normalizePath("/sanctum")).toBe("/sanctum");
    expect(normalizePath("/sanctum/subjects/8f1c2d0e-1111-4222-8333-444455556666"))
      .toBe("/sanctum");
    expect(normalizePath("/sanctum/messages/xyz")).toBe("/sanctum");
  });

  it("never stores a query string or fragment", () => {
    expect(normalizePath("/signin?email=someone@example.com")).toBe("/signin");
    expect(normalizePath("/library?q=secret+search#frag")).toBe("/library");
    expect(normalizePath("/library/track/x?token=abc")).toBe(
      "/library/track/[slug]",
    );
  });

  it("refuses to track the API, assets and service worker", () => {
    for (const p of [
      "/api/track",
      "/api/me/export",
      "/_next/static/chunks/main.js",
      "/icons/icon-192.png",
      "/art/covers/default.jpg",
      "/sw.js",
      "/manifest.webmanifest",
      "/favicon.ico",
    ]) {
      expect(normalizePath(p)).toBeNull();
    }
  });

  it("collapses an unknown route to its first segment, never its data", () => {
    expect(normalizePath("/newthing")).toBe("/newthing");
    expect(normalizePath("/newthing/a-private-slug/deeper")).toBe("/newthing/*");
    // A first segment that does not look like a route name is not kept at all.
    expect(normalizePath("/%2e%2e%2fetc")).toBe("/other");
    // Anything ending in a dotted suffix reads as an asset and is not tracked —
    // which also means an address that wandered into a URL never lands anywhere.
    expect(normalizePath("/user@example.com")).toBeNull();
  });

  it("normalises slashes and rejects non-paths", () => {
    expect(normalizePath("/library//track///slug")).toBe("/library/track/[slug]");
    expect(normalizePath("/library/")).toBe("/library");
    expect(normalizePath("https://evil.example/library")).toBeNull();
    expect(normalizePath("")).toBeNull();
    expect(normalizePath("library")).toBeNull();
  });

  it("never returns anything longer than the cap", () => {
    const long = `/${"a".repeat(500)}/${"b".repeat(500)}`;
    const out = normalizePath(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(64);
  });
});

describe("deviceFromUa", () => {
  it("buckets phones", () => {
    expect(
      deviceFromUa(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      ),
    ).toBe("mobile");
    expect(
      deviceFromUa("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36"),
    ).toBe("mobile");
  });

  it("buckets tablets, including Android without the mobile token", () => {
    expect(deviceFromUa("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(
      "tablet",
    );
    expect(deviceFromUa("Mozilla/5.0 (Linux; Android 13; SM-X710) Safari/537.36")).toBe(
      "tablet",
    );
  });

  it("falls back to desktop for anything else, including no UA at all", () => {
    expect(deviceFromUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      "desktop",
    );
    expect(deviceFromUa(null)).toBe("desktop");
    expect(deviceFromUa("")).toBe("desktop");
  });
});

describe("normalizeReferrerHost", () => {
  it("keeps a bare host and strips a full URL down to one", () => {
    expect(normalizeReferrerHost("patreon.com")).toBe("patreon.com");
    expect(
      normalizeReferrerHost("https://www.reddit.com/r/hypnosis/comments/abc/secret"),
    ).toBe("www.reddit.com");
  });

  it("drops ports, credentials and case", () => {
    expect(normalizeReferrerHost("Example.COM:8443")).toBe("example.com");
    expect(normalizeReferrerHost("user:pw@example.com")).toBe("example.com");
  });

  it("refuses anything that is not a host", () => {
    expect(normalizeReferrerHost(null)).toBeNull();
    expect(normalizeReferrerHost("")).toBeNull();
    expect(normalizeReferrerHost("localhost")).toBeNull();
    expect(normalizeReferrerHost("not a host")).toBeNull();
    expect(normalizeReferrerHost("javascript:alert(1)")).toBeNull();
    expect(normalizeReferrerHost(`${"a".repeat(200)}.com`)).toBeNull();
  });
});

describe("ranges", () => {
  it("defaults to 30d for anything unknown", () => {
    expect(parseRange(undefined)).toBe("30d");
    expect(parseRange("nonsense")).toBe("30d");
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("all")).toBe("all");
  });

  it("computes the start of the window, and null for all time", () => {
    const now = new Date("2026-07-25T12:00:00Z");
    expect(isoDay(rangeStart("7d", now)!)).toBe("2026-07-18");
    expect(isoDay(rangeStart("90d", now)!)).toBe("2026-04-26");
    expect(rangeStart("all", now)).toBeNull();
  });
});

describe("fillDays", () => {
  const now = new Date("2026-07-25T12:00:00Z");

  it("pads a sparse series to one point per day, ending today", () => {
    const out = fillDays(
      [{ day: "2026-07-24", visits: 5, visitors: 3 }],
      7,
      now,
    );
    expect(out).toHaveLength(7);
    expect(out[0]!.day).toBe("2026-07-19");
    expect(out[6]!.day).toBe("2026-07-25");
    expect(out[5]).toEqual({ day: "2026-07-24", visits: 5, visitors: 3 });
    expect(out[6]!.visits).toBe(0);
  });

  it("just sorts when the range is all time", () => {
    const out = fillDays(
      [
        { day: "2026-07-24", visits: 1, visitors: 1 },
        { day: "2026-01-02", visits: 2, visitors: 2 },
      ],
      null,
      now,
    );
    expect(out.map((d) => d.day)).toEqual(["2026-01-02", "2026-07-24"]);
  });
});

describe("bucketing maths", () => {
  it("returns null rather than 0% for an empty base", () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(5, 0)).toBeNull();
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 2)).toBe(100);
  });

  it("gives a visible bar to any non-zero value", () => {
    expect(barPct(0, 100)).toBe(0);
    expect(barPct(1, 1000)).toBe(2);
    expect(barPct(50, 100)).toBe(50);
    expect(barPct(5, 0)).toBe(0);
  });

  it("formats durations for her, not for a machine", () => {
    expect(humanMs(null)).toBe("—");
    expect(humanMs(0)).toBe("—");
    expect(humanMs(38_000)).toBe("38s");
    expect(humanMs(252_000)).toBe("4m 12s");
    expect(humanMs(3_840_000)).toBe("1h 04m");
    expect(clockS(0)).toBe("0:00");
    expect(clockS(605)).toBe("10:05");
    expect(clockS(null)).toBe("—");
  });

  it("clamps a client-reported dwell", () => {
    expect(clampDwell(-5)).toBe(0);
    expect(clampDwell(Number.NaN)).toBe(0);
    expect(clampDwell(1_500.6)).toBe(1_501);
    expect(clampDwell(DWELL_MAX_MS * 10)).toBe(DWELL_MAX_MS);
  });
});
