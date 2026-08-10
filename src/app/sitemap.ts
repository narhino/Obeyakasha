import type { MetadataRoute } from "next";
import { and, desc, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { listSeriesCards } from "@/lib/library/queries";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * `/sitemap.xml`, built from what is actually published right now.
 *
 * The value here is the FILE PAGES. Each recorded session already has a public
 * per-viewer page with its own title and description, and those are the pages a
 * stranger can plausibly find by searching for what they want done to them.
 * Nothing was ever telling a search engine they existed.
 *
 * WHAT IS DELIBERATELY LEFT OUT:
 *  · Anything with `ownerUserId` — a subject's own private upload (D7,
 *    absolute). This filter is the same one every subject-facing read uses.
 *  · Anything unpublished. A draft is not a page.
 *  · Every members' route. They are noindexed AND disallowed; listing one here
 *    would contradict both.
 *
 * Sealed and premiere files ARE listed: their page is public, states plainly
 * that it isn't theirs yet, and carries the way in. That page is the funnel —
 * hiding it would remove the only reason a stranger has to come.
 */

// Re-read per request rather than baked at build: she publishes files without
// redeploying, and a sitemap frozen at build time would never mention them.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: absoluteUrl("/library"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/about"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/commissions"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/terms"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: absoluteUrl("/privacy"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  let filePages: MetadataRoute.Sitemap = [];
  let seriesPages: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({
        slug: tracks.slug,
        publishedAt: tracks.publishedAt,
        updatedAt: tracks.updatedAt,
      })
      .from(tracks)
      .where(
        and(
          isNotNull(tracks.publishedAt),
          // Never a subject's private upload (D7).
          isNull(tracks.ownerUserId),
        ),
      )
      .orderBy(desc(tracks.publishedAt))
      .limit(5000);

    filePages = rows.map((t) => ({
      url: absoluteUrl(`/library/track/${t.slug}`),
      lastModified: t.updatedAt ?? t.publishedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

    const series = await listSeriesCards();
    seriesPages = series.map((s) => ({
      url: absoluteUrl(s.href),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch (err) {
    // A sitemap that 500s teaches a crawler to stop asking. Serve the static
    // pages rather than nothing, and say what broke in the log.
    console.error("[sitemap] catalogue read failed:", err);
  }

  return [...staticPages, ...filePages, ...seriesPages];
}
