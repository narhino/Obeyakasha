import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { trackAnalysis, tracks, transcripts, triggers } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { heuristicOrganize } from "@/lib/organize/heuristic";
import type { OrganizeInput } from "@/lib/organize/types";
import { llmAnalyze } from "./llm";
import {
  analysisDossierSchema,
  type AnalysisDossier,
  type AnalysisKeyword,
  type AnalysisTrigger,
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

/** Scan transcript segments for a phrase → up to 3 evidence spans (timestamps). */
function evidenceFor(
  phrase: string,
  segments: OrganizeInput["segments"],
): { start: number; end: number; phrase: string }[] {
  const p = phrase.toLowerCase().trim();
  if (p.length < 3) return [];
  return segments
    .filter((s) => s.text.toLowerCase().includes(p))
    .slice(0, 3)
    .map((s) => ({ start: s.start, end: s.end, phrase: s.text.trim() }));
}

/**
 * Merge the LLM dossier over the heuristic floor. The LLM owns the prose
 * (summary/description/effects/safety) and adds richer keywords/triggers; the
 * heuristic contributes anything the LLM missed. Evidence timestamps are
 * (re)attached by scanning segments so every finding is playable.
 */
function mergeDossiers(
  heuristic: AnalysisDossier,
  llm: AnalysisDossier,
  segments: OrganizeInput["segments"],
): AnalysisDossier {
  const keywords: AnalysisKeyword[] = [];
  const seenK = new Set<string>();
  for (const k of [...llm.keywords, ...heuristic.keywords]) {
    const key = `${k.tagKind}:${k.phrase.toLowerCase()}`;
    if (seenK.has(key)) continue;
    seenK.add(key);
    keywords.push({
      ...k,
      evidence: k.evidence.length ? k.evidence : evidenceFor(k.phrase, segments),
    });
  }
  const trigs: AnalysisTrigger[] = [];
  const seenT = new Set<string>();
  for (const t of [...llm.triggers, ...heuristic.triggers]) {
    const key = t.name.toLowerCase();
    if (seenT.has(key)) continue;
    seenT.add(key);
    trigs.push({
      ...t,
      evidence: t.evidence.length ? t.evidence : evidenceFor(t.name, segments),
    });
  }
  return analysisDossierSchema.parse({
    summary: llm.summary || heuristic.summary,
    keywords,
    triggers: trigs,
    suggestedTags: llm.suggestedTags.length
      ? llm.suggestedTags
      : heuristic.suggestedTags,
    suggestedDescription: llm.suggestedDescription,
    intendedEffects: llm.intendedEffects,
    safetyNotes: llm.safetyNotes,
  });
}

/**
 * Analyze one track → upsert its durable dossier (ROADMAP-v1.5 Phase D). The
 * heuristic floor always runs; when analysis is enabled and configured, the LLM
 * pass is merged over it. Runs as the `analyze` job after transcribe.
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

  const heuristic = heuristicDossier(input);
  let dossier = heuristic;
  let model = "heuristic";
  if (await getSetting("analysis_enabled")) {
    const llm = await llmAnalyze(input).catch(() => null);
    if (llm) {
      dossier = mergeDossiers(heuristic, llm, input.segments);
      // Generic label — the provider name never reaches the UI (privacy).
      model = "assisted";
    }
  }

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
      raw: { source: model, originalDescription: track.description },
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
