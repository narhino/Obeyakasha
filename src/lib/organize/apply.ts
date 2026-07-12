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
import { organizeProposalSchema } from "./types";

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "item"
  );
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

  // Tags → canonical tags + track_tags.
  for (const t of proposal.tags) {
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

  // Triggers → canonical triggers + track_triggers (with evidence timestamps).
  for (const t of proposal.triggers) {
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

  // Playlists → find/create by title + placement.
  for (const p of proposal.playlists) {
    const slug = slugify(p.target);
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
    // Avoid duplicate placement.
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
    void slug;
  }

  await db
    .update(reviewQueue)
    .set({ status: "approved", resolvedBy: actorId, resolvedAt: new Date() })
    .where(eq(reviewQueue.id, reviewId));
  await logAudit(actorId, "organize.approved", { reviewId, trackId });
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
