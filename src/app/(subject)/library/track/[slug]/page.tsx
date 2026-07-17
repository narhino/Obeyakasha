import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getTrackFilePage, getTrackMetaBySlug } from "@/lib/library/queries";
import { getRawSetting } from "@/lib/settings";
import { FilePlayAction } from "@/components/library/FilePlayAction";
import { Badge, Display, Ornament } from "@/components/ui";
import { IconSpark } from "@/components/ui/icons";
import { copy, fill } from "@/copy/copy";

// Public per-viewer file page (R3). Reads the session + DB per request.
export const dynamic = "force-dynamic";

const KIND_LABELS = copy.library.tagKinds as Record<string, string>;
const RELATION_LABELS = copy.library.filePage.relation as Record<string, string>;

function minutesLabel(s: number | null): string {
  if (s == null) return "";
  return fill(copy.library.filePage.duration, { n: Math.floor(s / 60) });
}

function publishedLabel(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await getTrackMetaBySlug(slug);
  if (!meta) {
    return {
      title: copy.library.filePage.metaFallbackTitle,
      description: copy.library.filePage.metaFallbackDesc,
    };
  }
  const description = meta.description
    ? meta.description.replace(/\s+/g, " ").trim().slice(0, 160)
    : copy.library.filePage.metaFallbackDesc;
  return {
    title: fill(copy.library.filePage.metaTitle, { title: meta.title }),
    description,
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
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

      {/* ── Hero: artwork + identity + primary action ── */}
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="w-full max-w-[220px] shrink-0">
          <div className="aspect-square overflow-hidden rounded-[var(--radius-lg)] border border-line/80 bg-surface">
            {page.artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={page.artworkUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-accent-soft/30 px-8">
                <Ornament className="w-full">{copy.brand.mark}</Ornament>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <Display className="text-3xl">{track.title}</Display>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-[0.1em] text-text-dim">
            {track.durationS != null ? (
              <span>{minutesLabel(track.durationS)}</span>
            ) : null}
            {track.durationS != null && page.publishedAt ? (
              <span aria-hidden>·</span>
            ) : null}
            {page.publishedAt ? <span>{publishedLabel(page.publishedAt)}</span> : null}
          </p>

          <div className="mt-5">
            <FilePlayAction
              track={{
                id: track.id,
                title: track.title,
                durationS: track.durationS,
                artworkKey: track.artworkKey,
              }}
              state={state}
              patreonPageUrl={patreonPageUrl}
            />
            {state === "entitled" && track.prereqMissing.length > 0 ? (
              <p className="mt-2 text-xs text-accent">
                {fill(copy.library.sealedByPrereq, {
                  track: track.prereqMissing.join(", "),
                })}
              </p>
            ) : state === "locked" ? (
              <p className="mt-2 text-xs text-text-dim/80">
                {fill(copy.library.sealed, { level: `level ${track.minAccessLevel}` })}
              </p>
            ) : state === "anon" ? (
              <p className="mt-2 text-xs text-text-dim/80">
                {copy.library.sealedAnon}
              </p>
            ) : null}
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
                  <span className="block truncate text-sm text-text">
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

      {/* ── "After this" rail ── */}
      {page.afterThis.length > 0 ? (
        <div className="mt-10">
          <p className="label-caps mb-3 text-text-dim/70">
            {copy.library.filePage.afterThisTitle}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {page.afterThis.map((t) => (
              <Link
                key={t.id}
                href={`/library/track/${t.slug}`}
                className="w-40 shrink-0 rounded-[var(--radius-lg)] border border-line bg-surface p-3 transition-colors duration-[var(--dur-med)] hover:border-gold/40"
              >
                <p className="truncate text-sm text-text">{t.title}</p>
                <p className="mt-0.5 text-xs text-text-dim">
                  {t.durationS != null ? minutesLabel(t.durationS) : ""}
                  {!t.unlocked
                    ? `${t.durationS != null ? " · " : ""}${copy.library.filePage.railSealed}`
                    : ""}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
