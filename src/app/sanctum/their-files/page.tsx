import { desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks, transcripts, users } from "@/lib/db/schema";
import { PageHeading, Whisper } from "@/components/ui";
import { TheirFilesClient, type TheirFileRow } from "./TheirFilesClient";

/**
 * Sanctum "Their files" (F1). Every personal file subjects have brought, grouped
 * by subject (the name she gave them, a count, a storage total). She can play
 * any of them, see its pipeline state, open its dossier (transcript), or remove
 * it. Goddess-only, so it reads across every owner — the D7 predicate is for
 * subjects, never for her.
 */
export const dynamic = "force-dynamic";

export interface SubjectGroup {
  userId: string;
  name: string;
  totalBytes: number;
  files: TheirFileRow[];
}

export default async function TheirFiles() {
  const rows = await db
    .select({
      trackId: tracks.id,
      title: tracks.title,
      durationS: tracks.durationS,
      sizeBytes: tracks.sizeBytes,
      pipeline: tracks.pipeline,
      hasAudio: tracks.streamKey,
      createdAt: tracks.createdAt,
      ownerUserId: tracks.ownerUserId,
      ownerName: users.chosenName,
      transcriptStatus: transcripts.status,
    })
    .from(tracks)
    .innerJoin(users, eq(users.id, tracks.ownerUserId))
    .leftJoin(transcripts, eq(transcripts.trackId, tracks.id))
    .where(isNotNull(tracks.ownerUserId))
    .orderBy(desc(tracks.createdAt));

  // Group by owner, newest-file-first preserved within each group.
  const byUser = new Map<string, SubjectGroup>();
  for (const r of rows) {
    const uid = r.ownerUserId!;
    const group =
      byUser.get(uid) ??
      ({
        userId: uid,
        name: r.ownerName?.trim() || "a subject",
        totalBytes: 0,
        files: [],
      } satisfies SubjectGroup);
    group.totalBytes += r.sizeBytes ?? 0;
    group.files.push({
      trackId: r.trackId,
      title: r.title,
      durationS: r.durationS,
      sizeBytes: r.sizeBytes,
      pipeline: r.pipeline,
      playable: r.hasAudio != null,
      transcriptStatus: r.transcriptStatus ?? "none",
    });
    byUser.set(uid, group);
  }
  const groups = [...byUser.values()];
  const totalFiles = rows.length;

  return (
    <div className="max-w-3xl">
      <PageHeading eyebrow="Catalog">Their files</PageHeading>
      <Whisper className="mt-1">
        What subjects have brought of their own. Each one is private to its owner
        — this is the only place, besides yours, it is ever seen. Play it, open
        its dossier for the transcript, or take it away.
      </Whisper>

      <TheirFilesClient groups={groups} totalFiles={totalFiles} />
    </div>
  );
}
