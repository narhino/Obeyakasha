import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getTrackFilePage, getTrackMetaBySlug } from "@/lib/library/queries";
import { getRawSetting } from "@/lib/settings";
import { isPremiereSealed } from "@/lib/premiere/logic";
import { FilePlayAction } from "@/components/library/FilePlayAction";
import { FileArtwork } from "@/components/library/FileArtwork";
import { resolveTrackCover } from "@/lib/art/resolve";
import { Badge, Cover, Display } from "@/components/ui";
import { IconSpark } from "@/components/ui/icons";
import { formatDuration } from "@/lib/format/duration";
import { formatDate, formatUntil } from "@/lib/format/when";
import { copy, fill } from "@/copy/copy";
import { absoluteUrl, publicMeta } from "@/lib/seo/site";
import { TrackJsonLd } from "@/components/seo/JsonLd";

// Public per-viewer file page (R3). Reads the session + DB per request.
export const dynamic = "force-dynamic";

const KIND_LABELS = copy.library.tagKinds as Record<string, string>;
const RELATION_LABELS = copy.library.filePage.relation as Record<string, string>;

/**
 * A page per recorded session — the whole reason organic search can work here.
 * Somebody searching for what they want done to them can land directly on the
 * file that does it, so this carries a real description, its own cover as the
 * link preview, and a canonical URL of its own.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getTrackMetaBySlug(slug);
  if (!meta) {
    // A slug that names nothing public must not be indexed as a real page —
    // otherwise a deleted or draft file leaves a hollow result behind.
    return {
      title: copy.library.filePage.metaFallbackTitle,
      description: copy.library.filePage.metaFallbackDesc,
      robots: { index: false, follow: true },
    };
  }
  const description = meta.description
    ? meta.description.replace(/\s+/g, " ").trim().slice(0, 155)
    : copy.seo.trackFallbackDescription;
  const cover = await resolveTrackCover(meta.artworkKey, []);
  return {
    ...publicMeta({
      title: meta.title,
      description,
      path: `/library/track/${slug}`,
      image: { url: cover, alt: meta.title },
      type: "article",
    }),
    // An audio page: say so, and give the dates that let a result show recency.
    openGraph: {
      type: "music.song",
      siteName: copy.brand.name,
      title: meta.title,
      description,
      url: absoluteUrl(`/library/track/${slug}`),
      images: [{ url: cover, alt: meta.title }],
      locale: "en_US",
      ...(meta.publishedAt
        ? { publishedTime: new Date(meta.publishedAt).toISOString() }
        : {}),
      ...(meta.updatedAt
        ? { modifiedTime: new Date(meta.updatedAt).toISOString() }
        : {}),
    },
  };
}

export default async function TrackFilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const signedIn = Boolean(userId);
  const isGoddess = session?.user?.role === "goddess";
  const access = userId
    ? await resolveAccess(userId)
    : { accessLevel: 0, inGrace: false, frozen: false, unmappedTierIds: [] };

  const page = await getTrackFilePage(
    slug,
    { userId, accessLevel: access.accessLevel },
    { isGoddess },
  );
  if (!page) notFound();

  const patreonPageUrl = await getRawSetting<string>(
    "patreon_page_url",
    "https://www.patreon.com",
  );

  const { track } = page;
  const state: "entitled" | "locked" | "anon" = !signedIn
    ? "anon"
    : track.unlocked
      ? "entitled"
      : "locked";
  // Premiere (R9.6): sealed until its moment — a countdown replaces the CTA.
  const premiereSealed = isPremiereSealed(track.premiereAt);
  const premiereWhen = premiereSealed ? formatUntil(track.premiereAt) : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* What this page IS, in the form a search engine reads: an audio work
          with a duration, a cover and a maker, sitting under the Library. Says
          truthfully whether it can be heard for free — claiming otherwise is
          how a site loses rich results. */}
      <TrackJsonLd
        title={track.title}
        description={
          track.description?.replace(/\s+/g, " ").trim().slice(0, 155) ||
          copy.seo.trackFallbackDescription
        }
        slug={track.slug}
        coverUrl={track.cover}
        durationS={track.durationS}
        publishedAt={page.publishedAt}
        free={track.freeSample}
      />
      <Link
        href="/library"
        className="text-xs uppercase tracking-[0.18em] text-text-dim transition-colors duration-[var(--dur-med)] hover:text-gold"
      >
        {copy.library.backToLibrary}
      </Link>

      {page.isDraftPreview ? (
        <div className="mt-3">
          <Badge tone="gold">{copy.library.filePage.draftBadge}</Badge>
        </div>
      ) : null}

      {/* ── Hero: big breathing artwork + identity + primary action, over a warm
          candlelight aura (shibby-style, D5). ── */}
      <div className="relative mt-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-8 -top-12 -z-10 h-80"
          style={{
            background:
              "radial-gradient(58% 100% at 22% 24%, color-mix(in srgb, var(--color-gold) 11%, transparent), transparent 72%)",
          }}
        />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="w-full max-w-[280px] shrink-0 sm:w-64">
            <FileArtwork
              trackId={track.id}
              cover={track.cover}
              premiereSealed={premiereSealed}
            />
          </div>

          <div className="min-w-0 flex-1">
            <Display size="opener">{track.title}</Display>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-[0.1em] text-text-dim">
            {track.durationS != null ? (
              <span>{formatDuration(track.durationS)}</span>
            ) : null}
            {track.durationS != null && page.publishedAt ? (
              <span aria-hidden>·</span>
            ) : null}
            {page.publishedAt ? <span>{formatDate(page.publishedAt)}</span> : null}
          </p>

          <div className="mt-5">
            <FilePlayAction
              track={{
                id: track.id,
                title: track.title,
                durationS: track.durationS,
                artworkKey: track.cover,
              }}
              state={state}
              patreonPageUrl={patreonPageUrl}
              frozen={access.frozen}
              isSample={track.freeSample}
              premiereWhen={premiereWhen}
            />
            {premiereSealed ? null : state === "entitled" &&
              track.prereqMissing.length > 0 ? (
              <p className="mt-2 text-xs text-accent">
                {fill(copy.library.sealedByPrereq, {
                  track: track.prereqMissing.join(", "),
                })}
              </p>
            ) : state === "locked" && !track.freeSample ? (
              /* Frozen means they may already have earned this one — telling
                 them to "rise to level N" would be a lie, and it is exactly
                 what kept sending them to her to ask. */
              <p
                className={`mt-2 text-xs ${access.frozen ? "text-danger/80" : "text-text-dim/80"}`}
              >
                {access.frozen
                  ? copy.standing.sealedByLapse
                  : fill(copy.library.sealed, {
                      level: `level ${track.minAccessLevel}`,
                    })}
              </p>
            ) : state === "anon" && !track.freeSample ? (
              <p className="mt-2 text-xs text-text-dim/80">
                {copy.library.sealedAnon}
              </p>
            ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ── Her description ── */}
      {track.description ? (
        <p className="mt-8 whitespace-pre-line text-sm leading-relaxed text-text">
          {track.description}
        </p>
      ) : null}

      {/* ── Tags, grouped by kind ── */}
      {page.tagGroups.length > 0 ? (
        <div className="mt-8 space-y-3">
          {page.tagGroups.map((group) => (
            <div key={group.kind}>
              <p className="label-caps mb-1.5 text-text-dim/70">
                {KIND_LABELS[group.kind] ?? group.kind}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/library?tags=${encodeURIComponent(tag.id)}`}
                    className="rounded-[var(--radius-full)] border border-line px-3 py-1 text-xs text-text-dim transition-colors duration-[var(--dur-med)] hover:border-gold/50 hover:text-gold"
                  >
                    {tag.value}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── Triggers mentioned (names + relation only) ── */}
      {page.triggers.length > 0 ? (
        <div className="mt-8">
          <p className="label-caps mb-2 text-text-dim/70">
            {copy.library.filePage.triggersTitle}
          </p>
          <ul className="space-y-1.5">
            {page.triggers.map((t, i) => (
              <li
                key={`${t.name}-${t.relation}-${i}`}
                className="flex flex-wrap items-baseline gap-x-2"
              >
                <span className="text-sm text-text">{t.name}</span>
                <span className="text-xs italic text-gold/80">
                  {RELATION_LABELS[t.relation] ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Belongs to: series + trainings ── */}
      {page.collections.length > 0 ? (
        <div className="mt-8">
          <p className="label-caps mb-2 text-text-dim/70">
            {copy.library.filePage.belongsTitle}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {page.collections.map((c) => (
              <Link
                key={`${c.kind}-${c.id}`}
                href={c.href}
                className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-3 transition-colors duration-[var(--dur-med)] hover:border-gold/40"
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-accent-soft/50 text-gold"
                >
                  <IconSpark size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block line-clamp-2 text-sm text-text">
                    {c.title}
                  </span>
                  <span className="label-caps block text-text-dim/70">
                    {c.kind === "series"
                      ? copy.library.filePage.seriesLabel
                      : copy.library.filePage.trainingLabel}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── "After this" rail — where she takes you next (cover cards, D5) ── */}
      {page.afterThis.length > 0 ? (
        <div className="mt-12">
          <p className="label-caps mb-3 text-text-dim/70">
            {copy.library.filePage.afterThisTitle}
          </p>
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
            {page.afterThis.map((t) => {
              // `t.unlocked` is a LEVEL test, and a logged-out visitor reads as
              // level 0 — so on its own it showed level-0 files as open to the
              // anonymous. The rail now seals exactly what the catalog grid and
              // this page's own CTA seal: everything but a free sample, unless
              // they are signed in and entitled.
              const railSealed = !t.freeSample && (!signedIn || !t.unlocked);
              return (
                <Link
                  key={t.id}
                  href={`/library/track/${t.slug}`}
                  className="group w-36 shrink-0 sm:w-40"
                >
                  <Cover
                    src={t.cover}
                    dimmed={railSealed}
                    className="aspect-square"
                  />
                  <p className="mt-2 line-clamp-2 text-sm text-text transition-colors duration-[var(--dur-med)] group-hover:text-gold">
                    {t.title}
                  </p>
                  <p className="text-xs text-text-dim">
                    {t.durationS != null ? formatDuration(t.durationS) : ""}
                    {railSealed
                      ? `${t.durationS != null ? " · " : ""}${copy.library.filePage.railSealed}`
                      : ""}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </main>
  );
}
