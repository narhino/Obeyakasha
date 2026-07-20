import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { trackTags, tracks, transcripts } from "@/lib/db/schema";
import { PageHeading, Whisper } from "@/components/ui";
import { LibraryClient } from "./LibraryClient";
import type { LibraryRow } from "./types";

/** Imported-but-audioless shells still waiting for their files (fail-soft). */
async function waitingShellCount(): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tracks)
      .where(and(eq(tracks.source, "patreon_import"), isNull(tracks.streamKey)));
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Sanctum Library (ROADMAP-v1.5 C1.2 + C1.4). Server-renders the first paint,
 * then the client keeps it live: streaming uploads with progress bars and a
 * self-refreshing table — no manual refresh anywhere.
 */
export const dynamic = "force-dynamic";

export default async function SanctumLibrary() {
  const rows = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      slug: tracks.slug,
      description: tracks.description,
      visibility: tracks.visibility,
      minAccessLevel: tracks.minAccessLevel,
      durationS: tracks.durationS,
      downloadable: tracks.downloadable,
      freeSample: tracks.freeSample,
      premiereAt: tracks.premiereAt,
      streamKey: tracks.streamKey,
      pipeline: tracks.pipeline,
      transcriptStatus: transcripts.status,
    })
    .from(tracks)
    .leftJoin(transcripts, eq(transcripts.trackId, tracks.id))
    // F1: exclude subjects' personal uploads — they have their own oversight
    // page (Their files) and never belong in her catalog Library.
    .where(isNull(tracks.ownerUserId))
    .orderBy(desc(tracks.createdAt));

  const [counts, shells] = await Promise.all([
    rows.length
      ? db
          .select({ trackId: trackTags.trackId, n: sql<number>`count(*)::int` })
          .from(trackTags)
          .groupBy(trackTags.trackId)
      : Promise.resolve([]),
    waitingShellCount(),
  ]);
  const tagMap = new Map(counts.map((c) => [c.trackId, Number(c.n)]));

  const initial: LibraryRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    visibility: r.visibility,
    minAccessLevel: r.minAccessLevel,
    durationS: r.durationS,
    downloadable: r.downloadable,
    freeSample: r.freeSample,
    premiereAt: r.premiereAt ? r.premiereAt.toISOString() : null,
    hasAudio: r.streamKey != null,
    pipeline: r.pipeline,
    transcriptStatus: (r.transcriptStatus ??
      "none") as LibraryRow["transcriptStatus"],
    tagCount: tagMap.get(r.id) ?? 0,
  }));

  return (
    <div className="max-w-3xl">
      <PageHeading eyebrow="Catalog">Library</PageHeading>
      <Whisper className="mt-1">
        Drop audio, set its level, publish. Uploads show progress and the list
        stays live — no refreshing.
      </Whisper>

      {/* Quiet doorway to the Patreon importer (no longer a top tab). */}
      <Link
        href="/sanctum/import"
        className="mt-5 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-line/80 bg-surface px-4 py-3 transition-colors duration-[var(--dur-med)] hover:border-gold/40"
      >
        <span className="min-w-0 text-sm text-text-dim">
          <span className="font-[family-name:var(--font-display)] text-base text-text">
            Bring from Patreon
          </span>{" "}
          — import posts, attach audio.
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {shells > 0 ? (
            <span className="nums-lining inline-flex min-w-[1.15rem] items-center justify-center rounded-full border border-gold/40 bg-gold/15 px-1.5 py-0.5 text-[0.6875rem] leading-none text-gold">
              {shells}
            </span>
          ) : null}
          <span className="text-xs uppercase tracking-[0.14em] text-text-dim">
            Open →
          </span>
        </span>
      </Link>

      <LibraryClient initial={initial} />
    </div>
  );
}
