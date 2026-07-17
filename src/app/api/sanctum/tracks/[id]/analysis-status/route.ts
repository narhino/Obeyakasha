import type { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, trackAnalysis } from "@/lib/db/schema";
import { withGoddess } from "@/lib/api";

/**
 * Live analysis state for the dossier (F02). Goddess-only. Tells the dossier
 * whether a `track_analysis` row exists (and when it last changed) and the state
 * of the most recent analyze job for the track, so "Run analysis" can show a
 * working state, reflect completion, and surface a failure instead of feeling
 * dead. Cheap, polled while a run is in flight.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withGoddess(async () => {
    const [analysis] = await db
      .select({ updatedAt: trackAnalysis.updatedAt })
      .from(trackAnalysis)
      .where(eq(trackAnalysis.trackId, id))
      .limit(1);

    // The most recent analyze job for this track (dedupeKey is stable per track).
    const [job] = await db
      .select({ status: jobs.status, lastError: jobs.lastError })
      .from(jobs)
      .where(eq(jobs.dedupeKey, `analyze:${id}`))
      .orderBy(desc(jobs.createdAt))
      .limit(1);

    return {
      analysisUpdatedAt: analysis?.updatedAt
        ? analysis.updatedAt.toISOString()
        : null,
      job: job ? { status: job.status, error: job.lastError } : null,
    };
  });
}
