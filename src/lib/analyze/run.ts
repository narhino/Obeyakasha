import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { trackAnalysis, tracks, transcripts, triggers } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { heuristicOrganize } from "@/lib/organize/heuristic";
import type { OrganizeInput } from "@/lib/organize/types";
import {
  analysisDossierSchema,
  type AnalysisDossier,
  type KeywordCategory,
} from "./schema";

/** Map our tag_kind onto a shibbydex-style keyword category (heuristic floor). */
function categoryForKind(kind: string): KeywordCategory {
  switch (kind) {
    case "theme":
      return "fetish";
    case "purpose":
    case "format":
      return "hypnosis_type";
    case "intensity":
      return "state";
    default:
      return "descriptive";
  }
}

/**
 * Build a dossier from the always-on heuristic organizer. This is the floor
 * that runs even when the LLM is disabled or errors; D3 layers Opus 4.8 output
 * over it without dropping the evidence timestamps found here.
 */
export function heuristicDossier(input: OrganizeInput): AnalysisDossier {
  const org = heuristicOrganize(input);
  return analysisDossierSchema.parse({
    summary: "",
    keywords: org.tags.map((t) => ({
      phrase: t.value,
      category: categoryForKind(t.kind),
      tagKind: t.kind,
      salience: 0.5,
      status: "proposed",
      evidence: [],
    })),
    triggers: org.triggers.map((t) => ({
      name: t.name,
      relation: t.relation,
      confidence: t.confidence,
      status: "proposed",
      evidence: t.evidence,
    })),
    suggestedTags: org.tags,
    suggestedDescription: null,
    intendedEffects: [],
    safetyNotes: null,
  });
}

/**
 * Analyze one track → upsert its durable dossier (ROADMAP-v1.5 Phase D). D1
 * ships the heuristic floor; D3 adds the Opus 4.8 pass merged over it. Runs as
 * the `analyze` job between transcribe and organize.
 */
export async function analyzeTrack(trackId: string): Promise<void> {
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

  const input: OrganizeInput = {
    title: track.title,
    description: track.description,
    fullText: tr?.fullText ?? "",
    segments: tr?.segments ?? [],
    knownTriggers,
  };

  const dossier = heuristicDossier(input);
  const model = "heuristic";

  await db
    .insert(trackAnalysis)
    .values({
      trackId,
      model,
      summary: dossier.summary,
      keywords: dossier.keywords,
      triggers: dossier.triggers,
      suggestedTags: dossier.suggestedTags,
      suggestedDescription: dossier.suggestedDescription,
      intendedEffects: dossier.intendedEffects,
      safetyNotes: dossier.safetyNotes,
      raw: { source: model },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: trackAnalysis.trackId,
      set: {
        model,
        summary: dossier.summary,
        keywords: dossier.keywords,
        triggers: dossier.triggers,
        suggestedTags: dossier.suggestedTags,
        intendedEffects: dossier.intendedEffects,
        safetyNotes: dossier.safetyNotes,
        updatedAt: new Date(),
      },
    });

  await logAudit(null, "analysis.done", {
    trackId,
    model,
    keywords: dossier.keywords.length,
    triggers: dossier.triggers.length,
  });
}
