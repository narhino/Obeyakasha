import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getSeriesPage } from "@/lib/library/queries";
import { getRawSetting } from "@/lib/settings";
import { SeriesClient } from "@/components/library/SeriesClient";
import { Cover, Display, Whisper } from "@/components/ui";
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

      {/* ── Cover + identity, over a warm aura (D5) ── */}
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
            <Cover src={series.cover} className="aspect-square" />
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
            <Display size="opener" className="mt-3">
              {series.title}
            </Display>
            {series.description ? (
              <Whisper className="mt-3 max-w-md">{series.description}</Whisper>
            ) : null}
          </div>
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
