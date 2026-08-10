import type { Metadata } from "next";
import { env } from "@/lib/env";
import { copy } from "@/copy/copy";

/**
 * Everything search engines are allowed to see, decided in ONE place.
 *
 * The app shipped with `robots: { index: false, follow: false }` on the root
 * layout — a site-wide instruction to every crawler to ignore all of it. That
 * is correct for a members' app and completely wrong for the half of this one
 * that is a public shopfront: the landing page, the catalogue, and a page per
 * recorded file, all of which are already readable by a logged-out stranger.
 * The result was a site that could only ever be reached from Patreon.
 *
 * The rule now is explicit rather than blanket:
 *  · PUBLIC surfaces are indexable and carry real titles, descriptions,
 *    canonicals, link previews and structured data.
 *  · Everything with a person behind it — the Sanctum, a subject's own pages,
 *    every API route — is noindexed in its own layout AND disallowed in
 *    robots.txt. Two independent locks, because one of them being wrong must
 *    not be enough to publish a member's page.
 *
 * D7 holds absolutely here: nothing in the sitemap, in any description, or in
 * any structured-data block names or implies a subject.
 */

/** Absolute origin, e.g. `https://obeyakasha.com`. No trailing slash. */
export const SITE_ORIGIN = env.APP_ORIGIN.replace(/\/+$/, "");

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The link-preview image, used when a page has nothing more specific. */
export const OG_IMAGE = {
  url: absoluteUrl("/og"),
  width: 1200,
  height: 630,
  alt: copy.seo.homeTitle,
};

/**
 * Metadata every indexable public page starts from.
 *
 * `canonical` is per-page and REQUIRED: this app renders the same catalogue at
 * one URL for signed-in and logged-out visitors, and query strings (a tag
 * filter, a returning `?from=`) would otherwise each look like a separate page
 * competing with the real one.
 */
export function publicMeta(params: {
  title: string;
  description: string;
  path: string;
  /** Overrides the preview image — a file page uses its own cover. */
  image?: { url: string; alt: string };
  type?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(params.path);
  const image = params.image
    ? { url: params.image.url, alt: params.image.alt }
    : OG_IMAGE;
  return {
    title: params.title,
    description: params.description,
    alternates: { canonical: url },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        // Let Google show a real snippet, a large preview and video previews —
        // the defaults are conservative and cost clicks for no benefit.
        "max-snippet": -1,
        "max-image-preview": "large",
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: params.type ?? "website",
      siteName: copy.brand.name,
      title: params.title,
      description: params.description,
      url,
      images: [image],
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: params.title,
      description: params.description,
      images: [image.url],
    },
  };
}

/**
 * Metadata for a page that must never reach a search result.
 *
 * `nocache` and `noimageindex` are included deliberately: a member's page must
 * not survive in a search cache or an image result after the page itself is
 * gone from the index.
 */
export const PRIVATE_META: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

/** Paths no crawler should ever walk. Mirrors the noindex on each layout. */
export const DISALLOWED_PATHS = [
  "/api/",
  "/sanctum",
  "/sanctum/",
  "/me",
  "/messages",
  "/inbox",
  "/orders",
  "/asks",
  "/settings",
  "/programs",
  "/threshold",
  "/signin",
  "/styleguide",
];
