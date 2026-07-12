import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceCorpus } from "@/lib/db/schema";
import { env } from "@/lib/env";

/**
 * AI reply drafting (F11, PLAN §13.8 / §17). Draft-first: returns 3 candidate
 * replies in Akasha's voice built from BRAND rules + her approved past replies
 * (voice_corpus) + the thread + a profile summary. NEVER sends. Returns null
 * when no LLM key is configured (the Sanctum then hides the "Propose" button).
 */
export function replyDraftingConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

const VOICE_RULES = `You are drafting replies AS Akasha, a femdom erotic-hypnosis creator, to a
private message from one of her subjects. Voice: whispered authority, warm but
sovereign, present tense, second person. Possessive endearments (my subject, my
good one, pet, mine) — NEVER maternal (no baby/honey/dear). She never pleads
("please") and never apologizes ("sorry"). Concrete, not essayistic. Keep each
reply 1-3 sentences. Return ONLY a JSON array of exactly 3 strings, no prose.`;

export async function draftReplies(params: {
  thread: { sender: "subject" | "goddess"; body: string | null }[];
  profileSummary: string;
}): Promise<string[] | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = process.env.LLM_DRAFTS_MODEL || "claude-sonnet-5";

  const samples = await db
    .select({ text: voiceCorpus.text })
    .from(voiceCorpus)
    .orderBy(desc(voiceCorpus.createdAt))
    .limit(8);

  const convo = params.thread
    .slice(-10)
    .map((m) => `${m.sender === "goddess" ? "AKASHA" : "SUBJECT"}: ${m.body ?? ""}`)
    .join("\n");

  const user = [
    `Subject profile: ${params.profileSummary}`,
    samples.length
      ? `Her real past replies (match this voice):\n${samples.map((s) => `- ${s.text}`).join("\n")}`
      : "",
    `Conversation so far:\n${convo}`,
    `Draft 3 replies she could send now.`,
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
        max_tokens: 512,
        system: VOICE_RULES,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end < 0) return null;
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    return arr.filter((x): x is string => typeof x === "string").slice(0, 3);
  } catch {
    return null;
  }
}
