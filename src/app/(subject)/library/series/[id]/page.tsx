import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getSeriesPage } from "@/lib/library/queries";
import { getRawSetting } from "@/lib/settings";
import { SeriesClient } from "@/components/library/SeriesClient";
import { Display, Ornament, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

// Public per-viewer series page (R4). Reads session + DB per request.
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const signedIn = Boolean(userId);
  const access = userId
    ? await resolveAccess(userId)
    : { accessLevel: 0, inGrace: false, frozen: false, unmappedTierIds: [] };

  const series = await getSeriesPage(id, {
    userId,
    accessLevel: access.accessLevel,
  });
  if (!series) notFound();

  const patreonPageUrl = await getRawSetting<string>(
    "patreon_page_url",
    "https://www.patreon.com",
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/library?segment=series"
        className="text-xs uppercase tracking-[0.18em] text-text-dim transition-colors duration-[var(--dur-med)] hover:text-gold"
      >
        {copy.library.backToLibrary}
      </Link>

      {/* ── Cover + identity ── */}
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="w-full max-w-[220px] shrink-0">
          <div className="aspect-square overflow-hidden rounded-[var(--radius-lg)] border border-line/80 bg-surface">
            {series.artworkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={series.artworkUrl}
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
          <span
            className={`inline-block rounded-[var(--radius-sm)] border px-2 py-0.5 text-[0.625rem] uppercase tracking-[0.08em] ${
              series.cadence === "ended"
                ? "border-line text-text-dim"
                : series.cadence === "weekly"
                  ? "border-gold/30 text-gold"
                  : "border-accent/30 text-text-dim"
            }`}
          >
            {copy.library.cadence[series.cadence]}
          </span>
          <Display className="mt-3 text-3xl">{series.title}</Display>
          {series.description ? (
            <Whisper className="mt-2 max-w-md">{series.description}</Whisper>
          ) : null}
        </div>
      </div>

      <div className="mt-7">
        <SeriesClient
          tracks={series.tracks}
          seriesTitle={series.title}
          signedIn={signedIn}
          patreonPageUrl={patreonPageUrl}
        />
      </div>
    </main>
  );
}
