import { env } from "@/lib/env";
import type { OrganizeInput } from "@/lib/organize/types";
import { analysisDossierSchema, type AnalysisDossier } from "./schema";

/**
 * Heavy dossier analysis via the Anthropic Messages API (ROADMAP-v1.5 D3). This
 * is the "great agent doing the heavy work": from the title + transcript it
 * returns the full dossier — categorised keywords, triggers with relations, a
 * description rewrite in Akasha's voice, intended effects, and safety notes.
 *
 * The model id comes from LLM_ANALYZE_MODEL (set that to a top-tier model in
 * .env for the heavy pass); it falls back to the organize model. Returns null
 * on any failure so `analyzeTrack` keeps the heuristic floor. Prose is in
 * Akasha's voice; the provider is never surfaced to the UI (privacy).
 */
export function analyzeConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

function analyzeModel(): string {
  return (
    env.LLM_ANALYZE_MODEL || env.LLM_ORGANIZE_MODEL || "claude-sonnet-5"
  );
}

const SYSTEM = `You are the archivist for a private members library of femdom
erotic-hypnosis audio (hypnotherapy with erotic energy — never pornographic).
You read one track's title and transcript and return a structured dossier so the
creator (Akasha) can curate it. Any prose you write is in HER voice: intimate,
commanding, elegant, second-person, never clinical or generic app-speak.

Respond with ONLY a JSON object, no prose around it, matching exactly:
{
  "summary": "1-2 sentences on what this session does, in her voice",
  "keywords": [
    {"phrase": "short label", "category": "fetish|descriptive|hypnosis_type|state",
     "tagKind": "purpose|theme|format|intensity|custom", "salience": 0.0}
  ],
  "triggers": [
    {"name": "the exact trigger phrase", "relation": "installs|reinforces|requires",
     "phrase": "how it appears", "confidence": 0.0, "suggestedSafetyNotes": "optional"}
  ],
  "suggestedTags": [{"kind": "purpose|theme|format|intensity|custom", "value": "label"}],
  "suggestedDescription": "a clean, in-voice description a subject would read",
  "intendedEffects": ["short phrases: what she wants it to do to them"],
  "safetyNotes": "anything worth flagging, or empty"
}

Rules:
- category: fetish = themes/kinks (chastity, worship); hypnosis_type = technique
  (induction, deepening, conditioning); state = intensity/depth; descriptive =
  everything else.
- tagKind maps to how it files: purpose (what it does), theme (what it's about),
  format (how it's delivered), intensity, custom.
- Be CONSERVATIVE with triggers: only include ones actually installed or
  reinforced in the transcript. Better to miss one than invent one.
- salience/confidence in 0..1. Keep labels short and lowercase.`;

export async function llmAnalyze(
  input: OrganizeInput,
): Promise<AnalysisDossier | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const user = [
    `Title: ${input.title}`,
    input.description ? `Current description: ${input.description}` : "",
    `Known trigger vocabulary: ${input.knownTriggers.map((t) => t.name).join(", ") || "(none)"}`,
    `Transcript:\n${input.fullText.slice(0, 28000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: analyzeModel(),
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    const parsed = analysisDossierSchema.safeParse(
      JSON.parse(text.slice(start, end + 1)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
