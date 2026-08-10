import type { MetadataRoute } from "next";
import { DISALLOWED_PATHS, absoluteUrl } from "@/lib/seo/site";

/**
 * `/robots.txt`, generated so the disallow list can never drift from the
 * noindex rules it mirrors (`src/lib/seo/site.ts`).
 *
 * Note what robots.txt is NOT: it is a request, not a control. It keeps honest
 * crawlers out of the members' area and off the API; it protects nothing. Every
 * private route is separately gated by middleware and separately noindexed —
 * this file exists so a well-behaved crawler doesn't waste its budget on pages
 * it will be redirected away from anyway.
 */
// MUST be dynamic. Prerendered at build time this file bakes in whatever
// APP_ORIGIN the BUILD had — and the production image is built without one, so
// a static robots.txt would ship pointing every crawler at
// `http://localhost:3000/sitemap.xml`. Read at request time instead.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED_PATHS,
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
