import { env } from "@/lib/env";
import {
  organizeProposalSchema,
  type OrganizeInput,
  type OrganizeProposal,
} from "@/lib/organize/types";

/**
 * Optional LLM organize pass (PLAN §8.3, §17). Uses the Anthropic Messages API
 * directly (no SDK dependency) when ANTHROPIC_API_KEY is set; returns null
 * otherwise so organize falls back to the heuristic pass. Output is zod-
 * validated; any failure returns null (never blocks organizing).
 */
export function llmConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You organize femdom erotic-hypnosis audio for a private members library.
Given a track's title and transcript, propose normalized metadata. Respond with
ONLY a JSON object, no prose, matching exactly:
{
  "tags": [{"kind": "purpose|theme|format|intensity|custom", "value": "short label"}],
  "triggers": [{"name": "...", "relation": "installs|reinforces|requires", "evidence": [{"start": 0, "end": 0, "phrase": "..."}], "confidence": 0.0}],
  "playlists": [{"target": "playlist or program name", "reason": "..."}]
}
purpose ∈ induction, deepening, conditioning, trigger, maintenance, sleep.
Be conservative; only include triggers actually present in the transcript.`;

export async function llmOrganize(
  input: OrganizeInput,
): Promise<OrganizeProposal | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.LLM_ORGANIZE_MODEL || "claude-sonnet-5";

  const user = [
    `Title: ${input.title}`,
    input.description ? `Description: ${input.description}` : "",
    `Known trigger vocabulary: ${input.knownTriggers.map((t) => t.name).join(", ") || "(none)"}`,
    `Transcript:\n${input.fullText.slice(0, 24000)}`,
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
        model,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) return null;
    const parsed = organizeProposalSchema.safeParse(
      JSON.parse(text.slice(jsonStart, jsonEnd + 1)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
