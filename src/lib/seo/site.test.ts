import { describe, expect, it } from "vitest";
import {
  DISALLOWED_PATHS,
  PRIVATE_META,
  SITE_ORIGIN,
  absoluteUrl,
  publicMeta,
} from "./site";
import { absoluteImage, iso8601Duration } from "@/components/seo/JsonLd";

describe("what search engines are allowed to see", () => {
  it("never lets a private area become indexable", () => {
    // The whole point of the change: the site went from blanket-noindex to
    // indexable-by-default, so the thing that must hold is that everything
    // with a person behind it stays shut.
    expect(PRIVATE_META.robots).toMatchObject({ index: false, follow: false });
    // And it must not linger in a cache or an image result either.
    expect(PRIVATE_META.robots).toMatchObject({ nocache: true });
  });

  it("keeps the robots.txt disallow list in step with the members' area", () => {
    // Every prefix middleware gates, or that belongs to one person, must be
    // listed. A route added to one and forgotten in the other is the failure
    // this test exists to catch.
    for (const p of [
      "/sanctum",
      "/me",
      "/messages",
      "/inbox",
      "/orders",
      "/asks",
      "/settings",
      "/programs",
      "/api/",
    ]) {
      expect(DISALLOWED_PATHS, `${p} must be disallowed`).toContain(p);
    }
    // The public shopfront must NOT be disallowed — that would undo the change.
    for (const p of ["/", "/library", "/about", "/commissions"]) {
      expect(DISALLOWED_PATHS).not.toContain(p);
    }
  });

  it("gives every public page an absolute canonical, which is what stops duplicates", () => {
    const meta = publicMeta({
      title: "The Library",
      description: "Every session she has recorded.",
      path: "/library",
    });
    expect(meta.alternates?.canonical).toBe(`${SITE_ORIGIN}/library`);
    expect(String(meta.alternates?.canonical)).toMatch(/^https?:\/\//);
    expect(meta.robots).toMatchObject({ index: true, follow: true });
    // A shared link must carry a picture, or most people never click it.
    expect(meta.openGraph?.images).toBeTruthy();
    expect(meta.twitter).toBeTruthy();
  });

  it("builds absolute urls whether or not the caller remembered the slash", () => {
    expect(absoluteUrl("/library")).toBe(`${SITE_ORIGIN}/library`);
    expect(absoluteUrl("library")).toBe(`${SITE_ORIGIN}/library`);
    // No double slash, whatever APP_ORIGIN was configured with.
    expect(absoluteUrl("/")).not.toContain("//library");
    expect(SITE_ORIGIN.endsWith("/")).toBe(false);
  });

  it("writes durations the way schema.org reads them", () => {
    expect(iso8601Duration(0)).toBe("PT0S");
    expect(iso8601Duration(45)).toBe("PT45S");
    expect(iso8601Duration(23 * 60)).toBe("PT23M");
    expect(iso8601Duration(3600)).toBe("PT1H");
    expect(iso8601Duration(3600 + 23 * 60 + 7)).toBe("PT1H23M7S");
  });
});

describe("structured data must stand on its own", () => {
  it("absolutizes a committed cover but leaves a signed URL untouched", () => {
    // A crawler reads this JSON with no page to resolve against, so a relative
    // path resolves to nothing and the image is silently dropped.
    expect(absoluteImage("/art/covers/default.jpg")).toBe(
      `${SITE_ORIGIN}/art/covers/default.jpg`,
    );
    // A signed stream URL is already absolute — prefixing would destroy it.
    const signed = "https://cdn.example.com/api/stream?key=abc&token=xyz";
    expect(absoluteImage(signed)).toBe(signed);
    expect(absoluteImage("http://localhost:3000/api/stream?key=a")).toBe(
      "http://localhost:3000/api/stream?key=a",
    );
  });
});
