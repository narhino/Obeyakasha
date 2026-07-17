import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getSeriesStub } from "@/lib/library/queries";
import { getRawSetting } from "@/lib/settings";
import { LibraryClient } from "@/components/library/LibraryClient";
import { Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

// Public per-viewer stub (full series pages arrive in R4). Reads session + DB.
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SeriesStubPage({
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

  const series = await getSeriesStub(id, {
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
      <Display className="mt-3 text-3xl">{series.title}</Display>
      {series.description ? (
        <Whisper className="mt-2 max-w-md">{series.description}</Whisper>
      ) : null}

      <div className="mt-6">
        <LibraryClient
          tracks={series.tracks}
          signedIn={signedIn}
          patreonPageUrl={patreonPageUrl}
        />
      </div>
    </main>
  );
}
