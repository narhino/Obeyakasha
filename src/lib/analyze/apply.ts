import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { trackAnalysis, trackTags } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { applyTags, applyTriggers } from "@/lib/organize/apply";
import {
  analysisKeywordSchema,
  analysisTriggerSchema,
  type AnalysisKeyword,
  type AnalysisTrigger,
  type FindingStatus,
} from "./schema";

/**
 * Dossier approve/dismiss (ROADMAP-v1.5 Phase D). Approving turns a finding into
 * a real tag / track_trigger AND flips its status in the durable ledger to
 * `approved`; dismissing only flips the status to `dismissed`. Nothing is ever
 * deleted from `track_analysis` — a dismissed finding can be reconsidered.
 */

interface Findings {
  keywords: AnalysisKeyword[];
  triggers: AnalysisTrigger[];
}

async function loadFindings(trackId: string): Promise<Findings | null> {
  const [row] = await db
    .select({
      keywords: trackAnalysis.keywords,
      triggers: trackAnalysis.triggers,
    })
    .from(trackAnalysis)
    .where(eq(trackAnalysis.trackId, trackId))
    .limit(1);
  if (!row) return null;
  const keywords = (row.keywords as unknown[])
    .map((k) => analysisKeywordSchema.safeParse(k))
    .filter((r) => r.success)
    .map((r) => (r as { data: AnalysisKeyword }).data);
  const triggers = (row.triggers as unknown[])
    .map((t) => analysisTriggerSchema.safeParse(t))
    .filter((r) => r.success)
    .map((r) => (r as { data: AnalysisTrigger }).data);
  return { keywords, triggers };
}

async function setKeywordStatus(
  trackId: string,
  phrase: string,
  tagKind: string,
  status: FindingStatus,
): Promise<void> {
  const f = await loadFindings(trackId);
  if (!f) return;
  const keywords = f.keywords.map((k) =>
    k.phrase === phrase && k.tagKind === tagKind ? { ...k, status } : k,
  );
  await db
    .update(trackAnalysis)
    .set({ keywords, updatedAt: new Date() })
    .where(eq(trackAnalysis.trackId, trackId));
}

async function setTriggerStatus(
  trackId: string,
  name: string,
  status: FindingStatus,
): Promise<void> {
  const f = await loadFindings(trackId);
  if (!f) return;
  const triggers = f.triggers.map((t) =>
    t.name === name ? { ...t, status } : t,
  );
  await db
    .update(trackAnalysis)
    .set({ triggers, updatedAt: new Date() })
    .where(eq(trackAnalysis.trackId, trackId));
}

/**
 * Mark a trigger finding approved AND fold her edits back into the ledger: the
 * finding takes her final name (so the dossier's "on the track" match — which
 * compares finding names to the applied trigger — still holds after a rename,
 * and a re-run doesn't re-propose it as new) and remembers her safety note.
 */
async function setTriggerApproved(
  trackId: string,
  originalName: string,
  finalName: string,
  safetyNotes: string | null,
): Promise<void> {
  const f = await loadFindings(trackId);
  if (!f) return;
  const triggers = f.triggers.map((t) =>
    t.name === originalName
      ? {
          ...t,
          name: finalName,
          status: "approved" as const,
          ...(safetyNotes ? { suggestedSafetyNotes: safetyNotes } : {}),
        }
      : t,
  );
  await db
    .update(trackAnalysis)
    .set({ triggers, updatedAt: new Date() })
    .where(eq(trackAnalysis.trackId, trackId));
}

/** Approve a keyword → create/link the tag and mark the finding approved. */
export async function approveKeyword(
  trackId: string,
  phrase: string,
  tagKind: "purpose" | "theme" | "format" | "intensity" | "custom",
): Promise<void> {
  await applyTags(trackId, [{ kind: tagKind, value: phrase }]);
  await setKeywordStatus(trackId, phrase, tagKind, "approved");
  await logAudit(null, "dossier.keyword_approved", { trackId, phrase, tagKind });
}

export async function dismissKeyword(
  trackId: string,
  phrase: string,
  tagKind: string,
): Promise<void> {
  await setKeywordStatus(trackId, phrase, tagKind, "dismissed");
  await logAudit(null, "dossier.keyword_dismissed", { trackId, phrase });
}

/**
 * Approve a trigger finding → create/link the trigger + track_trigger, using the
 * goddess's EDITED values (she can complete a partial name, add the description
 * and safety notes the reading missed). `originalName` locates the finding in the
 * ledger; `edited` carries what she actually approves. Relation + evidence stay
 * from the finding. Falls back to the raw finding when nothing was edited.
 */
export async function approveTrigger(
  trackId: string,
  originalName: string,
  actorId: string | null,
  edited?: {
    name?: string;
    description?: string | null;
    safetyNotes?: string | null;
  },
): Promise<void> {
  const f = await loadFindings(trackId);
  const found = f?.triggers.find((t) => t.name === originalName);
  if (!found) throw new Error("Trigger finding not found");
  const finalName = (edited?.name ?? found.name).trim() || found.name;
  const description = edited?.description?.trim() ? edited.description.trim() : null;
  const safetyNotes = edited?.safetyNotes?.trim()
    ? edited.safetyNotes.trim()
    : found.suggestedSafetyNotes?.trim()
      ? found.suggestedSafetyNotes.trim()
      : null;
  await applyTriggers(trackId, [
    {
      name: finalName,
      relation: found.relation,
      evidence: found.evidence,
      description,
      safetyNotes,
    },
  ]);
  await setTriggerApproved(trackId, originalName, finalName, safetyNotes);
  await logAudit(actorId, "dossier.trigger_approved", {
    trackId,
    name: finalName,
    relation: found.relation,
  });
}

export async function dismissTrigger(
  trackId: string,
  name: string,
): Promise<void> {
  await setTriggerStatus(trackId, name, "dismissed");
  await logAudit(null, "dossier.trigger_dismissed", { trackId, name });
}

/** Manually add a tag not proposed by the agent. */
export async function addManualTag(
  trackId: string,
  kind: "purpose" | "theme" | "format" | "intensity" | "custom",
  value: string,
): Promise<void> {
  await applyTags(trackId, [{ kind, value }]);
  await logAudit(null, "dossier.tag_added", { trackId, kind, value });
}

/** Unlink a tag from the track (leaves the canonical tag row intact). */
export async function removeTrackTag(
  trackId: string,
  tagId: string,
): Promise<void> {
  await db
    .delete(trackTags)
    .where(and(eq(trackTags.trackId, trackId), eq(trackTags.tagId, tagId)));
  await logAudit(null, "dossier.tag_removed", { trackId, tagId });
}
