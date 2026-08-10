import { copy } from "@/copy/copy";
import { SITE_ORIGIN, absoluteUrl } from "@/lib/seo/site";

/**
 * Structured data (schema.org), so a search engine understands what a page IS
 * rather than guessing from prose.
 *
 * This is what earns a rich result: a file page that declares itself an
 * AudioObject with a duration and a cover can be shown as one, and an
 * assistant asked "who is Akasha" can answer from the Person block instead of
 * scraping a sentence at random.
 *
 * SAFETY: everything below is built only from her own published catalogue and
 * her own brand strings. No subject, no count of subjects, and nothing behind
 * the gate is described here — structured data is the most public thing on a
 * page, and D7 applies to it hardest.
 *
 * CSP: emitted as `application/ld+json`, which is DATA, not script. It is not
 * executed and needs no script-src allowance.
 */
function Block({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // The content is ours and JSON-serialized; `<` is escaped so a title
      // containing markup can never break out of the tag.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** Who she is and what this site is — emitted once, on the home page. */
export function SiteJsonLd({ patreonUrl }: { patreonUrl?: string | null }) {
  const person = {
    "@type": "Person",
    "@id": `${SITE_ORIGIN}/#akasha`,
    name: copy.brand.name,
    alternateName: "Obey Akasha",
    description: copy.seo.creatorDescription,
    url: SITE_ORIGIN,
    ...(patreonUrl ? { sameAs: [patreonUrl] } : {}),
  };
  return (
    <Block
      data={{
        "@context": "https://schema.org",
        "@graph": [
          person,
          {
            "@type": "WebSite",
            "@id": `${SITE_ORIGIN}/#website`,
            url: SITE_ORIGIN,
            name: "Obey Akasha",
            description: copy.seo.homeDescription,
            inLanguage: "en",
            publisher: { "@id": `${SITE_ORIGIN}/#akasha` },
            // Tells a search engine the catalogue is searchable, which can
            // surface a search box directly in the result.
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${SITE_ORIGIN}/library?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          },
          {
            "@type": "WebPage",
            "@id": `${SITE_ORIGIN}/#webpage`,
            url: SITE_ORIGIN,
            name: copy.seo.homeTitle,
            isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
            about: { "@id": `${SITE_ORIGIN}/#akasha` },
            // Honest labelling, in the machine-readable place for it.
            isFamilyFriendly: false,
          },
        ],
      }}
    />
  );
}

/**
 * One recorded session. The `AudioObject` is the point: it carries the title,
 * the cover, how long it runs and who made it.
 *
 * `isAccessibleForFree` is stated truthfully per file. Claiming a gated file is
 * free is the exact thing that gets a site's rich results revoked, so it
 * follows the real flag rather than always saying yes.
 */
export function TrackJsonLd({
  title,
  description,
  slug,
  coverUrl,
  durationS,
  publishedAt,
  free,
}: {
  title: string;
  description: string;
  slug: string;
  coverUrl: string;
  durationS: number | null;
  publishedAt: Date | null;
  free: boolean;
}) {
  const url = absoluteUrl(`/library/track/${slug}`);
  const image = absoluteImage(coverUrl);
  return (
    <Block
      data={{
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "AudioObject",
            "@id": `${url}#audio`,
            name: title,
            description,
            url,
            thumbnailUrl: image,
            image,
            // ISO 8601, e.g. 23 minutes → PT23M.
            ...(durationS ? { duration: iso8601Duration(durationS) } : {}),
            ...(publishedAt
              ? { datePublished: new Date(publishedAt).toISOString() }
              : {}),
            inLanguage: "en",
            isFamilyFriendly: false,
            isAccessibleForFree: free,
            creator: { "@id": `${SITE_ORIGIN}/#akasha` },
            publisher: { "@id": `${SITE_ORIGIN}/#akasha` },
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Obey Akasha",
                item: SITE_ORIGIN,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "Library",
                item: absoluteUrl("/library"),
              },
              { "@type": "ListItem", position: 3, name: title, item: url },
            ],
          },
        ],
      }}
    />
  );
}

/**
 * Structured data must carry ABSOLUTE urls — a crawler reads this JSON on its
 * own, with no page to resolve a relative path against, so `/art/cover.jpg`
 * simply resolves to nothing and the image is dropped from the result.
 *
 * Covers arrive in two shapes: a signed stream URL (already absolute) and a
 * committed default like `/art/covers/default.jpg` (not). Only the second needs
 * the origin, and blindly prefixing would corrupt the first.
 */
export function absoluteImage(url: string): string {
  return /^https?:\/\//i.test(url) ? url : absoluteUrl(url);
}

/** Seconds → an ISO 8601 duration schema.org accepts. */
export function iso8601Duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${rest || (!h && !m) ? `${rest}S` : ""}`;
}
