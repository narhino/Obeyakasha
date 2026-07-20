import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import {
  continueListening,
  listCatalogTracks,
  listMyUploads,
  listSeriesCards,
  listTagGroups,
  type CatalogTrack,
  type LibraryTrack,
  type MyUpload,
  type SeriesCard,
  type TagGroup,
} from "@/lib/library/queries";
import { getRawSetting, getSetting } from "@/lib/settings";
import { EMPTY_IMAGE } from "@/lib/art/defaults";
import { LibraryClient } from "@/components/library/LibraryClient";
import { ContinueShelf } from "@/components/library/ContinueShelf";
import { SurrenderBand } from "@/components/library/SurrenderBand";
import { YoursShelf } from "@/components/library/YoursShelf";
import {
  Badge,
  Button,
  Card,
  Cover,
  Display,
  EmptyState,
  Input,
  Ornament,
  Voice,
  Whisper,
} from "@/components/ui";
import { copy, fill } from "@/copy/copy";

// Reads the session + DB per request; the catalog is public but per-viewer.
export const dynamic = "force-dynamic";

function toArray(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Build a /library URL preserving search + filters + segment. */
function libraryHref(params: {
  q?: string;
  tags?: string[];
  segment?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.segment && params.segment !== "files")
    sp.set("segment", params.segment);
  if (params.q) sp.set("q", params.q);
  for (const id of params.tags ?? []) sp.append("tags", id);
  const qs = sp.toString();
  return qs ? `/library?${qs}` : "/library";
}

const KIND_LABELS = copy.library.tagKinds as Record<string, string>;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tags?: string | string[];
    segment?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const signedIn = Boolean(userId);
  const access = userId
    ? await resolveAccess(userId)
    : { accessLevel: 0, inGrace: false, frozen: false, unmappedTierIds: [] };

  const segment = sp.segment === "series" ? "series" : "files";
  const q = typeof sp.q === "string" ? sp.q : "";
  const activeTags = toArray(sp.tags);

  // Surrender (R9.7) is for the claimed only: signed-in, not frozen, with a
  // level that actually unlocks something.
  const entitled = signedIn && !access.frozen && access.accessLevel >= 1;

  const patreonPageUrl = await getRawSetting<string>(
    "patreon_page_url",
    "https://www.patreon.com",
  );

  let content: ReactNode;
  if (segment === "series") {
    const cards = await listSeriesCards();
    content = <SeriesGrid cards={cards} />;
  } else {
    const [tagGroups, catalog, continueRow, myUploads, uploadsEnabled] =
      await Promise.all([
        listTagGroups(),
        listCatalogTracks(
          { userId, accessLevel: access.accessLevel },
          { q, tagIds: activeTags },
        ),
        signedIn && userId
          ? continueListening(userId, access.accessLevel)
          : Promise.resolve([] as { track: LibraryTrack; positionS: number }[]),
        // F1: their private shelf + whether she's taking files right now.
        signedIn && userId
          ? listMyUploads(userId)
          : Promise.resolve([] as MyUpload[]),
        signedIn
          ? getSetting("subject_uploads_enabled")
          : Promise.resolve(false),
      ]);
    content = (
      <FilesSegment
        tagGroups={tagGroups}
        tracks={catalog.tracks}
        fallback={catalog.fallback}
        continueRow={continueRow}
        signedIn={signedIn}
        entitled={entitled}
        patreonPageUrl={patreonPageUrl}
        q={q}
        activeTags={activeTags}
        myUploads={myUploads}
        uploadsEnabled={uploadsEnabled}
      />
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 lg:max-w-5xl">
      <div className="mb-2 flex items-center justify-between">
        <Display size="opener">{copy.library.title}</Display>
        {signedIn ? (
          access.frozen ? (
            <Badge tone="danger">frozen</Badge>
          ) : access.inGrace ? (
            <Badge tone="gold">grace · {access.accessLevel}</Badge>
          ) : (
            <Badge tone="gold">level {access.accessLevel}</Badge>
          )
        ) : null}
      </div>

      {!signedIn ? (
        <>
          <Ornament className="mb-4 w-40" />
          <Voice className="mb-6 max-w-md">{copy.library.publicIntro}</Voice>
        </>
      ) : null}

      {signedIn && access.frozen ? (
        <Card className="mb-6 border-danger/40">
          <Whisper className="text-base text-text">{copy.lapse.frozen}</Whisper>
          <a
            href={patreonPageUrl}
            className="mt-3 inline-block text-sm text-gold underline"
          >
            {copy.lapse.resubscribe}
          </a>
        </Card>
      ) : signedIn && access.inGrace ? (
        <Card className="mb-6 border-gold/40">
          <Whisper className="text-text">{copy.lapse.grace}</Whisper>
        </Card>
      ) : null}

      <nav className="mb-5 flex gap-5 border-b border-line/70" aria-label="Library segments">
        {(
          [
            ["files", copy.library.segFiles],
            ["series", copy.library.segSeries],
          ] as const
        ).map(([seg, label]) => {
          const active = segment === seg;
          const href =
            seg === "files"
              ? libraryHref({ q, tags: activeTags, segment: "files" })
              : libraryHref({ segment: "series" });
          return (
            <Link
              key={seg}
              href={href}
              className={`-mb-px border-b-2 pb-2 text-xs uppercase tracking-[0.18em] transition-colors duration-[var(--dur-med)] ${
                active
                  ? "border-gold text-gold"
                  : "border-transparent text-text-dim hover:text-text"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {content}
    </main>
  );
}

/** Search box + tag-chip filters + the catalog list (server-driven). */
function FilesSegment({
  tagGroups,
  tracks,
  fallback,
  continueRow,
  signedIn,
  entitled,
  patreonPageUrl,
  q,
  activeTags,
  myUploads,
  uploadsEnabled,
}: {
  tagGroups: TagGroup[];
  tracks: CatalogTrack[];
  fallback: "related" | "popular" | null;
  continueRow: { track: LibraryTrack; positionS: number }[];
  signedIn: boolean;
  entitled: boolean;
  patreonPageUrl: string;
  q: string;
  activeTags: string[];
  myUploads: MyUpload[];
  uploadsEnabled: boolean;
}) {
  const filtersActive = q !== "" || activeTags.length > 0;
  // Only offer Surrender when the shelf isn't already narrowed by a search —
  // "let her choose" reads oddly under an active filter (F-consistency).
  const showSurrender = entitled && !filtersActive;
  return (
    <div>
      {showSurrender ? <SurrenderBand /> : null}
      {continueRow.length > 0 ? <ContinueShelf rows={continueRow} /> : null}

      <form
        method="get"
        action="/library"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="segment" value="files" />
        {activeTags.map((id) => (
          <input key={id} type="hidden" name="tags" value={id} />
        ))}
        <Input
          name="q"
          defaultValue={q}
          placeholder={copy.library.searchPlaceholder}
          aria-label={copy.library.searchPlaceholder}
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="sm" variant="ghost">
          {copy.library.searchAction}
        </Button>
        {filtersActive ? (
          <Link
            href="/library"
            className="text-xs text-text-dim hover:text-gold"
          >
            {copy.library.clearSearch}
          </Link>
        ) : null}
      </form>

      {/* F1: "Yours" — the subject's private shelf, right by the search. */}
      {signedIn ? (
        <YoursShelf enabled={uploadsEnabled} uploads={myUploads} />
      ) : null}

      {tagGroups.length > 0 ? (
        <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-3">
          {tagGroups.map((group) => (
            <div key={group.kind} className="flex flex-wrap items-center gap-2">
              <p className="label-caps text-text-dim/70">
                {KIND_LABELS[group.kind] ?? group.kind}
              </p>
              {group.tags.map((tag) => {
                  const on = activeTags.includes(tag.id);
                  const nextTags = on
                    ? activeTags.filter((x) => x !== tag.id)
                    : [...activeTags, tag.id];
                  return (
                    <Link
                      key={tag.id}
                      href={libraryHref({ q, tags: nextTags, segment: "files" })}
                      className={`rounded-[var(--radius-full)] border px-3 py-1 text-xs transition-colors duration-[var(--dur-med)] ${
                        on
                          ? "border-gold text-gold"
                          : "border-line text-text-dim hover:text-text"
                      }`}
                    >
                      {tag.value}
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>
      ) : null}

      <LibraryClient
        tracks={tracks}
        signedIn={signedIn}
        patreonPageUrl={patreonPageUrl}
        fallback={fallback}
      />
    </div>
  );
}

/** One cover card for a training or a series (record-shop tile, D5). */
function SeriesCardTile({ c }: { c: SeriesCard }) {
  return (
    <Link href={c.href} className="group flex flex-col">
      <Cover src={c.cover} className="aspect-square" />
      <p className="mt-2.5 line-clamp-2 font-[family-name:var(--font-display)] text-base leading-tight text-text transition-colors duration-[var(--dur-med)] group-hover:text-gold">
        {c.title}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {c.kind === "training" ? (
          <span className="rounded-[var(--radius-sm)] border border-accent/40 px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] text-text-dim">
            {copy.library.trainingChip}
          </span>
        ) : null}
        {c.cadence ? (
          <span
            className={`rounded-[var(--radius-sm)] border px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] ${
              c.cadence === "ended"
                ? "border-line text-text-dim"
                : c.cadence === "weekly"
                  ? "border-gold/30 text-gold"
                  : "border-accent/30 text-text-dim"
            }`}
          >
            {copy.library.cadence[c.cadence]}
          </span>
        ) : null}
        <span className="text-xs text-text-dim">
          {fill(copy.library.seriesCount, { n: c.count })}
        </span>
      </div>
    </Link>
  );
}

/**
 * Series segment: two labelled groups so a Training is named before the click
 * (R-organize). Trainings (programs) link to /programs; Series (curated
 * playlists) link to their own page.
 */
function SeriesGrid({ cards }: { cards: SeriesCard[] }) {
  if (cards.length === 0) {
    return (
      <EmptyState image={EMPTY_IMAGE} className="mt-10">
        {copy.library.seriesEmpty}
      </EmptyState>
    );
  }
  const trainings = cards.filter((c) => c.kind === "training");
  const series = cards.filter((c) => c.kind === "series");

  return (
    <div className="space-y-9">
      {trainings.length > 0 ? (
        <section>
          <p className="label-caps mb-3">{copy.library.groupTrainings}</p>
          <div className="enter-stagger grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {trainings.map((c) => (
              <SeriesCardTile key={`${c.kind}-${c.id}`} c={c} />
            ))}
          </div>
        </section>
      ) : null}
      {series.length > 0 ? (
        <section>
          <p className="label-caps mb-3">{copy.library.groupSeries}</p>
          <div className="enter-stagger grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {series.map((c) => (
              <SeriesCardTile key={`${c.kind}-${c.id}`} c={c} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
