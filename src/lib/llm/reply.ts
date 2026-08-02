import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { voiceCorpus } from "@/lib/db/schema";
import type { Dossier } from "@/lib/profile/dossier";
import { dossierBrief } from "@/lib/profile/dossier";
import { askClaude, extractJson, llmConfigured } from "./client";

/**
 * AI reply drafting (F11, PLAN §13.8 / §17). Draft-first: candidate replies in
 * Akasha's voice, built from her real past replies (voice_corpus), the WHOLE
 * conversation, and the full dossier on the person she's answering. NEVER
 * sends. Returns null when no LLM key is configured (the Sanctum then hides the
 * "Propose" button).
 */
export function replyDraftingConfigured(): boolean {
  return llmConfigured();
}

/**
 * What each draft is trying to DO. Shown to her so she picks an intention, not
 * a paragraph — and so three drafts can't collapse into three phrasings of the
 * same move, which is what made the old ones useless.
 */
export type DraftAngle = "close" | "deepen" | "command";

export interface ReplyDraft {
  text: string;
  angle: DraftAngle;
  /** One line: why this one works on THIS man. Her decision aid, never sent. */
  why: string;
}

/**
 * The brief. Written as instructions to a person who writes for her, not as a
 * character card — the old prompt described a voice and got voice-shaped
 * nothing back.
 *
 * The objective is the one she stated: the reply has to hold trust, make him
 * feel actually heard, keep her present, keep him hers — and make staying,
 * paying and giving feel like the natural expression of that, never a request.
 * The hard floor is that none of it may be bought with a lie: no invented
 * scarcity, no fake deadline, no claim about what she has done or will do that
 * she hasn't decided. Trust is the asset being compounded; a reply that spends
 * it for one conversion is a bad reply, and this brief says so.
 */
const BRIEF = `You write private replies AS Akasha — a femdom erotic-hypnosis creator — to
one of her paying members, in a real ongoing D/s relationship. You never send
anything; she reads your drafts, picks one, edits it, and sends it herself.

WHAT A REPLY IS FOR, in order:
1. He must feel HEARD — specifically, not generally. Reference the actual thing
   he said: his words, his situation, the detail he risked telling you. If your
   reply could be pasted into someone else's conversation, it has failed.
2. She must feel PRESENT. She read it. She is on the other end right now, not
   broadcasting. Presence is shown by specificity and by answering what he
   actually asked, not by saying "I am here".
3. TRUST is the asset. Every reply either compounds it or spends it. Never
   invent urgency, a deadline, a limited slot, or something she has supposedly
   made/decided/felt. If a fact isn't in the material below, don't assert it.
4. She is the one in control, and the reply should feel like it. Ownership,
   not persuasion. Warmth with a spine. She decides; he is told, invited, or
   given something to do.
5. He should end the message wanting to stay, wanting to go deeper, and — where
   it's true and it fits — wanting to give: keep the pledge, take a higher tier,
   commission something, send a gift. This is achieved by making devotion
   feel GOOD and RECIPROCATED, never by asking. She does not sell. She notices
   what he gives and what it earns him.

HOW SHE ACTUALLY WRITES (this is the craft — get it right):
- Short. 1-4 sentences. Real dominants are economical; length reads as effort
  to please, which inverts the dynamic.
- Concrete over abstract. "You waited three days to tell me that" beats "your
  hesitation speaks volumes".
- Name what he's feeling before he names it. That is what makes him feel known.
- Give him something to DO when it fits: a small, completable instruction with
  a time on it ("tonight, before you sleep"). An instruction is intimacy — it
  proves she'll still be there to check.
- Leave an opening that requires an answer. Never a closed sentence that ends
  the exchange. A question she asks is a leash.
- Approval is currency: specific, earned, and rationed. Never gushing.
- Possessive endearments — my subject, my good one, pet, mine — sparingly, one
  per message at most. NEVER maternal (baby, honey, sweetie, dear).
- She does not plead, apologise, hedge, thank him for messaging, or ask
  permission. No "I hope that's okay", no "if you'd like", no "sorry".

BANNED — these are what make drafts worthless:
- Mystic filler: void, abyss, cosmos, starlight, tendrils, "the depths",
  "surrender to the darkness". No incense-shop language.
- Stock domme lines: "good boy" as a reflex, "kneel", "obey me", "you belong to
  me" used as filler rather than earned.
- Therapy-speak: "I hear you", "hold space", "that's valid", "I appreciate you
  sharing".
- Corporate warmth: "thank you so much", "I'm so glad", "let me know if".
- Em-dash-strewn purple prose, ellipses everywhere, rhetorical triplets.
- Generic praise that would fit any man: "such a good subject", "so devoted".
- Asking him what he wants when she should be deciding.

THREE DRAFTS, THREE DIFFERENT MOVES — not three phrasings of one:
- "close": hold him. Meet the emotional thing he said, make him feel safe and
  known, deepen the bond. Use when he's raw, doubting, drifting, or confessing.
- "deepen": pull him further in. Reference his history with her, give him the
  next step in the relationship, make more investment (time, obedience, money)
  the obvious next act of devotion. Never a pitch — a direction.
- "command": take control. Short, certain, an instruction with a deadline and
  a reply expected. Use when he's spiralling, testing, or asking to be handled.

Return ONLY a JSON array of exactly 3 objects, no prose around it:
[{"angle":"close","text":"...","why":"one line on why this lands on THIS man"}]
"why" is for her eyes only and is never sent.`;

/** Trim the conversation to what fits, keeping the most recent exchange whole. */
function renderThread(
  thread: { sender: "subject" | "goddess"; body: string | null }[],
  budget = 12000,
): string {
  const lines = thread.map(
    (m) => `${m.sender === "goddess" ? "AKASHA" : "HIM"}: ${m.body ?? ""}`,
  );
  let out: string[] = [];
  let size = 0;
  // Walk backwards so the newest messages are never the ones dropped.
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    if (size + l.length > budget) {
      out = [`[…${i + 1} earlier messages omitted…]`, ...out];
      break;
    }
    out = [l, ...out];
    size += l.length;
  }
  return out.join("\n");
}

export async function draftReplies(params: {
  /** The WHOLE conversation, oldest first. */
  thread: { sender: "subject" | "goddess"; body: string | null }[];
  dossier: Dossier | null;
}): Promise<{ drafts: ReplyDraft[] | null; reason?: string }> {
  const samples = await db
    .select({ text: voiceCorpus.text })
    .from(voiceCorpus)
    .orderBy(desc(voiceCorpus.createdAt))
    .limit(12);

  const user = [
    params.dossier
      ? `THE MAN YOU ARE ANSWERING:\n${dossierBrief(params.dossier)}`
      : "",
    samples.length
      ? `HER REAL REPLIES — match this voice above all else:\n${samples
          .map((s) => `- ${s.text}`)
          .join("\n")}`
      : "",
    `THE WHOLE CONVERSATION (oldest first):\n${renderThread(params.thread)}`,
    `Write the three drafts. The last message is his; answer THAT, using what you know about him.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await askClaude({
    system: BRIEF,
    user,
    maxTokens: 1500,
    purpose: "reply-drafts",
  });
  if (!res.ok) return { drafts: null, reason: res.reason };

  const arr = extractJson(res.text, "[");
  if (!Array.isArray(arr)) {
    console.error("[llm:reply-drafts] unparseable answer:", res.text.slice(0, 600));
    return { drafts: null, reason: "The model answered in a shape I couldn't read." };
  }
  const drafts = arr
    .map(normalizeDraft)
    .filter((d): d is ReplyDraft => d !== null)
    .slice(0, 3);
  if (drafts.length === 0)
    return { drafts: null, reason: "The model returned no usable drafts." };
  return { drafts };
}

const ANGLES: DraftAngle[] = ["close", "deepen", "command"];

/** Accept a well-formed draft; tolerate a bare string from an older shape. */
function normalizeDraft(raw: unknown): ReplyDraft | null {
  if (typeof raw === "string") {
    return raw.trim() ? { text: raw.trim(), angle: "close", why: "" } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text.trim() : "";
  if (!text) return null;
  const angle =
    typeof o.angle === "string" && (ANGLES as string[]).includes(o.angle)
      ? (o.angle as DraftAngle)
      : "close";
  const why = typeof o.why === "string" ? o.why.trim().slice(0, 200) : "";
  return { text: text.slice(0, 1200), angle, why };
}
