import { z } from "zod";
import { tagProposalSchema } from "@/lib/organize/types";

/**
 * The track dossier (ROADMAP-v1.5 Phase D). One structured object per track,
 * produced by the analyze agent (heuristic floor + Opus 4.8 in D3) and stored
 * permanently in `track_analysis` — the "nothing lost" ledger. Everything the
 * agent ever found stays here; approving/dismissing only flips a finding's
 * `status`, never deletes it.
 */

/** shibbydex-style grouping for a keyword. */
export const keywordCategory = z.enum([
  "fetish",
  "descriptive",
  "hypnosis_type",
  "state",
]);

/** Pre-mapped to our tag_kind so approval is one click. */
export const analysisTagKind = z.enum([
  "purpose",
  "theme",
  "format",
  "intensity",
  "custom",
]);

/** Lifecycle of a single finding inside the ledger. */
export const findingStatus = z.enum(["proposed", "approved", "dismissed"]);

const timeSpan = z.object({ start: z.number(), end: z.number() });
const evidenceSpan = timeSpan.extend({ phrase: z.string().default("") });

export const analysisKeywordSchema = z.object({
  phrase: z.string().min(1).max(80),
  category: keywordCategory,
  tagKind: analysisTagKind,
  salience: z.number().min(0).max(1).default(0.5),
  status: findingStatus.default("proposed"),
  evidence: z.array(timeSpan).default([]),
});

export const analysisTriggerSchema = z.object({
  name: z.string().min(1).max(80),
  relation: z.enum(["installs", "reinforces", "requires"]),
  phrase: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  suggestedSafetyNotes: z.string().optional(),
  status: findingStatus.default("proposed"),
  evidence: z.array(evidenceSpan).default([]),
});

export const analysisDossierSchema = z.object({
  summary: z.string().default(""),
  keywords: z.array(analysisKeywordSchema).default([]),
  triggers: z.array(analysisTriggerSchema).default([]),
  suggestedTags: z.array(tagProposalSchema).default([]),
  suggestedDescription: z.string().nullable().default(null),
  intendedEffects: z.array(z.string()).default([]),
  safetyNotes: z.string().nullable().default(null),
});

export type KeywordCategory = z.infer<typeof keywordCategory>;
export type FindingStatus = z.infer<typeof findingStatus>;
export type AnalysisKeyword = z.infer<typeof analysisKeywordSchema>;
export type AnalysisTrigger = z.infer<typeof analysisTriggerSchema>;
export type AnalysisDossier = z.infer<typeof analysisDossierSchema>;
