import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  reviewQueue,
  tracks,
  transcripts,
  triggers,
} from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { llmOrganize } from "@/lib/llm/organize";
import { getSetting } from "@/lib/settings";
import { autoApplyOrganize } from "./apply";
import { heuristicOrganize } from "./heuristic";
import { organizeProposalSchema, type OrganizeProposal } from "./types";

function mergeProposals(
  a: OrganizeProposal,
  b: OrganizeProposal | null,
): OrganizeProposal {
  if (!b) return a;
  const tagKey = (t: { kind: string; value: string }) =>
    `${t.kind}:${t.value.toLowerCase()}`;
  const tags = [...a.tags];
  const seenTags = new Set(a.tags.map(tagKey));
  for (const t of b.tags)
    if (!seenTags.has(tagKey(t))) {
      seenTags.add(tagKey(t));
      tags.push(t);
    }
  const trigs = [...a.triggers];
  const seenTrigs = new Set(a.triggers.map((t) => t.name.toLowerCase()));
  for (const t of b.triggers)
    if (!seenTrigs.has(t.name.toLowerCase())) {
      seenTrigs.add(t.name.toLowerCase());
      trigs.push(t);
    }
  const pls = [...a.playlists];
  const seenPls = new Set(a.playlists.map((p) => p.target.toLowerCase()));
  for (const p of b.playlists)
    if (!seenPls.has(p.target.toLowerCase())) {
      seenPls.add(p.target.toLowerCase());
      pls.push(p);
    }
  return { tags, triggers: trigs, playlists: pls };
}

/** Organize a single track → a pending review_queue row (replaces prior pending). */
export async function organizeTrack(trackId: string): Promise<void> {
  const [track] = await db
    .select()
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!track) return;
  const [tr] = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.trackId, trackId))
    .limit(1);
  const knownTriggers = await db
    .select({ name: triggers.name, slug: triggers.slug })
    .from(triggers);

  const input = {
    title: track.title,
    description: track.description,
    fullText: tr?.fullText ?? "",
    segments: tr?.segments ?? [],
    knownTriggers,
  };

  const heuristic = heuristicOrganize(input);
  const llm = await llmOrganize(input).catch(() => null);
  const proposal = organizeProposalSchema.parse(
    mergeProposals(heuristic, llm),
  );

  // Replace any existing pending row for this track (match on subjectRef.trackId).
  const pending = await db
    .select({ id: reviewQueue.id, subjectRef: reviewQueue.subjectRef })
    .from(reviewQueue)
    .where(
      and(eq(reviewQueue.kind, "tags"), eq(reviewQueue.status, "pending")),
    );
  const stale = pending
    .filter(
      (p) => (p.subjectRef as { trackId?: string } | null)?.trackId === trackId,
    )
    .map((p) => p.id);
  if (stale.length > 0) {
    await db.delete(reviewQueue).where(inArray(reviewQueue.id, stale));
  }

  const [review] = await db
    .insert(reviewQueue)
    .values({
      kind: "tags",
      subjectRef: { trackId, title: track.title },
      proposal,
      agentRationale: llm ? "heuristic + llm" : "heuristic",
      status: "pending",
    })
    .returning({ id: reviewQueue.id });
  await logAudit(null, "organize.proposed", {
    trackId,
    tags: proposal.tags.length,
    triggers: proposal.triggers.length,
  });

  // Auto-apply per the goddess's dial (ROADMAP-v1.5 C1.3). Default tags_only:
  // tags + playlists land now, triggers wait for review.
  const mode = await getSetting("organize_auto_apply");
  if (mode !== "review_all") {
    await autoApplyOrganize(trackId, review?.id ?? null, proposal, mode);
  }
}

/** Organize every published track that has a completed transcript. */
export async function organizeAll(): Promise<number> {
  const rows = await db
    .select({ id: tracks.id })
    .from(tracks)
    .innerJoin(transcripts, eq(transcripts.trackId, tracks.id))
    .where(
      and(eq(tracks.visibility, "published"), eq(transcripts.status, "done")),
    );
  for (const r of rows) await organizeTrack(r.id);
  return rows.length;
}
