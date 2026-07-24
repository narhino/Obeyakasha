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

/** Slugify a name into an id-safe token. Shared by the trigger up-serts. */
export function slugify(s: string): string {
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

/**
 * A trigger slug that stays unique in the shared `triggers` table. Mirrors the
 * media `uniqueSlug` loop but against triggers, and can exclude one id so an
 * edit that keeps (or only re-cases) its own slug never collides with itself.
 */
export async function uniqueTriggerSlug(
  base: string,
  excludeId?: string,
): Promise<string> {
  let slug = base;
  let n = 1;
  // Cheap uniqueness loop; trigger-slug collisions are rare at this scale.
  while (true) {
    const [row] = await db
      .select({ id: triggers.id })
      .from(triggers)
      .where(eq(triggers.slug, slug))
      .limit(1);
    if (!row || row.id === excludeId) return slug;
    slug = `${base}-${++n}`;
  }
}

/**
 * Find-or-create a canonical trigger by slug (triggers are shared entities,
 * PLAN §8.4). Returns its id. When one already exists for the slug we link to it
 * rather than duplicate; the goddess's completed description / safetyNotes fill
 * only still-empty fields, so linking never clobbers a trigger another track
 * already carries. New triggers are born with her edited values.
 */
export async function upsertTrigger(input: {
  name: string;
  description?: string | null;
  safetyNotes?: string | null;
}): Promise<string> {
  const name = input.name.trim();
  const slug = slugify(name);
  const description = input.description?.trim() ? input.description.trim() : null;
  const safetyNotes = input.safetyNotes?.trim() ? input.safetyNotes.trim() : null;

  const [existing] = await db
    .select({
      id: triggers.id,
      description: triggers.description,
      safetyNotes: triggers.safetyNotes,
    })
    .from(triggers)
    .where(eq(triggers.slug, slug))
    .limit(1);
  if (existing) {
    const patch: { description?: string; safetyNotes?: string } = {};
    if (description && !existing.description) patch.description = description;
    if (safetyNotes && !existing.safetyNotes) patch.safetyNotes = safetyNotes;
    if (Object.keys(patch).length > 0) {
      await db.update(triggers).set(patch).where(eq(triggers.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(triggers)
    .values({ name, slug, description, safetyNotes })
    .onConflictDoNothing({ target: triggers.slug })
    .returning({ id: triggers.id });
  if (created) return created.id;
  // Lost a race on the slug between select and insert — read the winner back.
  const [row] = await db
    .select({ id: triggers.id })
    .from(triggers)
    .where(eq(triggers.slug, slug))
    .limit(1);
  if (!row) throw new Error("Failed to upsert trigger");
  return row.id;
}

export interface TriggerToApply {
  name: string;
  relation: OrganizeProposal["triggers"][number]["relation"];
  evidence: OrganizeProposal["triggers"][number]["evidence"];
  description?: string | null;
  safetyNotes?: string | null;
}

/** Triggers → canonical triggers + track_triggers (with evidence). Idempotent. */
export async function applyTriggers(
  trackId: string,
  trigs: TriggerToApply[],
): Promise<void> {
  for (const t of trigs) {
    const triggerId = await upsertTrigger({
      name: t.name,
      description: t.description,
      safetyNotes: t.safetyNotes,
    });
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

/**
 * Rename / re-describe a shared trigger — the goddess editing after approval.
 * The final name drives a fresh unique slug (excluding this row, so an unchanged
 * or only-re-cased slug is kept); description / safetyNotes are set as given (a
 * blank clears them). Shared entity: this reshapes the trigger on every track
 * that carries it — intended (F5).
 */
export async function editTrigger(
  triggerId: string,
  input: {
    name: string;
    description?: string | null;
    safetyNotes?: string | null;
  },
  actorId: string | null,
): Promise<void> {
  const name = input.name.trim();
  const slug = await uniqueTriggerSlug(slugify(name), triggerId);
  await db
    .update(triggers)
    .set({
      name,
      slug,
      description: input.description?.trim() ? input.description.trim() : null,
      safetyNotes: input.safetyNotes?.trim() ? input.safetyNotes.trim() : null,
    })
    .where(eq(triggers.id, triggerId));
  await logAudit(actorId, "trigger.edited", { triggerId, name });
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

/**
 * Her edit of a proposed trigger before approving it (matched to the proposal by
 * its original AI name). Overrides the name and completes description/safetyNotes.
 */
export interface TriggerEdit {
  originalName: string;
  name: string;
  description?: string | null;
  safetyNotes?: string | null;
}

/** Apply an approved organize proposal to the track (PLAN §8.3). Idempotent. */
export async function applyReview(
  reviewId: string,
  actorId: string,
  triggerEdits?: TriggerEdit[],
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
  await applyTriggers(
    trackId,
    // Materialise each proposed trigger with her edits (if any) folded in; the
    // relation + evidence always come from the proposal.
    proposal.triggers.map((t) => {
      const e = triggerEdits?.find((x) => x.originalName === t.name);
      return {
        name: e?.name?.trim() ? e.name.trim() : t.name,
        relation: t.relation,
        evidence: t.evidence,
        description: e?.description,
        safetyNotes: e?.safetyNotes,
      };
    }),
  );
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
