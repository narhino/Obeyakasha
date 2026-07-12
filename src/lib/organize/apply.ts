import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  playlistItems,
  playlists,
  reviewQueue,
  tags,
  trackTags,
  trackTriggers,
  triggers,
} from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { organizeProposalSchema, type OrganizeProposal } from "./types";

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "item"
  );
}

/** Tags → canonical tags + track_tags. Idempotent. */
export async function applyTags(
  trackId: string,
  tagsProp: OrganizeProposal["tags"],
): Promise<void> {
  for (const t of tagsProp) {
    const [tag] = await db
      .insert(tags)
      .values({ kind: t.kind, value: t.value })
      .onConflictDoNothing({ target: [tags.kind, tags.value] })
      .returning();
    const tagId =
      tag?.id ??
      (
        await db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.kind, t.kind), eq(tags.value, t.value)))
          .limit(1)
      )[0]?.id;
    if (tagId) {
      await db
        .insert(trackTags)
        .values({ trackId, tagId, source: "agent" })
        .onConflictDoNothing();
    }
  }
}

/** Triggers → canonical triggers + track_triggers (with evidence). Idempotent. */
export async function applyTriggers(
  trackId: string,
  trigsProp: OrganizeProposal["triggers"],
): Promise<void> {
  for (const t of trigsProp) {
    const slug = slugify(t.name);
    const [trig] = await db
      .insert(triggers)
      .values({ name: t.name, slug })
      .onConflictDoNothing({ target: triggers.slug })
      .returning();
    const triggerId =
      trig?.id ??
      (
        await db
          .select({ id: triggers.id })
          .from(triggers)
          .where(eq(triggers.slug, slug))
          .limit(1)
      )[0]?.id;
    if (triggerId) {
      await db
        .insert(trackTriggers)
        .values({
          trackId,
          triggerId,
          relation: t.relation,
          timestamps: t.evidence,
        })
        .onConflictDoNothing();
    }
  }
}

/** Playlists → find/create by title + placement. Idempotent. */
async function applyPlaylists(
  trackId: string,
  plsProp: OrganizeProposal["playlists"],
): Promise<void> {
  for (const p of plsProp) {
    const [existing] = await db
      .select({ id: playlists.id })
      .from(playlists)
      .where(eq(playlists.title, p.target))
      .limit(1);
    let playlistId = existing?.id;
    if (!playlistId) {
      const [created] = await db
        .insert(playlists)
        .values({ title: p.target, kind: "curated", visibility: "draft" })
        .returning();
      playlistId = created!.id;
    }
    const [placed] = await db
      .select({ id: playlistItems.id })
      .from(playlistItems)
      .where(
        and(
          eq(playlistItems.playlistId, playlistId),
          eq(playlistItems.trackId, trackId),
        ),
      )
      .limit(1);
    if (!placed) {
      await db.insert(playlistItems).values({ playlistId, trackId, sort: 0 });
    }
  }
}

/** Apply an approved organize proposal to the track (PLAN §8.3). Idempotent. */
export async function applyReview(
  reviewId: string,
  actorId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(reviewQueue)
    .where(eq(reviewQueue.id, reviewId))
    .limit(1);
  if (!row) throw new Error("Review not found");
  const trackId = (row.subjectRef as { trackId?: string } | null)?.trackId;
  if (!trackId) throw new Error("Review has no track");

  const proposal = organizeProposalSchema.parse(row.proposal);
  await applyTags(trackId, proposal.tags);
  await applyTriggers(trackId, proposal.triggers);
  await applyPlaylists(trackId, proposal.playlists);

  await db
    .update(reviewQueue)
    .set({ status: "approved", resolvedBy: actorId, resolvedAt: new Date() })
    .where(eq(reviewQueue.id, reviewId));
  await logAudit(actorId, "organize.approved", { reviewId, trackId });
}

/**
 * Auto-apply an organize proposal per the `organize_auto_apply` setting
 * (ROADMAP-v1.5 C1.3), called by the pipeline right after a proposal is made:
 *  - "tags_only": apply tags + playlists now; leave triggers (safety-relevant)
 *    in the pending review row for the goddess to approve.
 *  - "everything": apply all three and mark the review row approved (system).
 * Idempotent; a later manual approval re-applies harmlessly.
 */
export async function autoApplyOrganize(
  trackId: string,
  reviewId: string | null,
  proposal: OrganizeProposal,
  mode: "tags_only" | "everything",
): Promise<void> {
  await applyTags(trackId, proposal.tags);
  await applyPlaylists(trackId, proposal.playlists);
  if (mode === "everything") {
    await applyTriggers(trackId, proposal.triggers);
    if (reviewId) {
      await db
        .update(reviewQueue)
        .set({ status: "approved", resolvedAt: new Date() })
        .where(eq(reviewQueue.id, reviewId));
    }
  }
  await logAudit(null, "organize.auto_applied", {
    trackId,
    mode,
    tags: proposal.tags.length,
    triggers: mode === "everything" ? proposal.triggers.length : 0,
  });
}

export async function rejectReview(
  reviewId: string,
  actorId: string,
): Promise<void> {
  await db
    .update(reviewQueue)
    .set({ status: "rejected", resolvedBy: actorId, resolvedAt: new Date() })
    .where(eq(reviewQueue.id, reviewId));
  await logAudit(actorId, "organize.rejected", { reviewId });
}
