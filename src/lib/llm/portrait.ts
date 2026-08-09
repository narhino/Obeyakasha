import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  messages,
  subjectProfiles,
  threads,
  whisperComments,
} from "@/lib/db/schema";
import { dossierBrief, subjectDossier } from "@/lib/profile/dossier";
import { askClaudeJson, llmConfigured } from "./client";

/**
 * The AI's read on one person (F1).
 *
 * She should not have to write a profile — she has a hundred of these people
 * and everything needed is already in the app, scattered across four tables.
 * This reads ALL of it in one pass — the whole conversation, every petition he
 * sent, every comment he left under a whisper, his ritual answers, his standing
 * and history, and her own notes — and returns a working read on him: what he
 * actually wants, what moves him, what to avoid, how he gives, whether he is
 * drifting, and what to do next.
 *
 * It is inference about a real person, so the brief forbids invention: where
 * the material doesn't support a claim, it must say so rather than fill the
 * space. A confident profile built on nothing is worse than no profile.
 */

export interface GeneratedProfile {
  portrait: string;
  wants: string[];
  respondsTo: string[];
  avoid: string[];
  money: string;
  risk: string;
  openings: string[];
  messagesSeen: number;
  generatedAt: Date;
}

const BRIEF = `You are reading everything one member of a femdom hypnosis creator's private
membership has ever said to her or written on her site, and producing HER
working file on him. He is an adult who chose this relationship and pays to be
in it. She reads this before she answers him; it is never shown to him.

Be useful, not flattering, and not literary. This is a working document.

RULES:
- Ground every claim in the material. Quote or paraphrase the specific thing
  that supports it. If the material doesn't support a claim, leave it out or
  say plainly there isn't enough to tell yet. NEVER invent a history, a job, a
  trauma, a relationship, or a motive that isn't there.
- Distinguish what he SAYS he wants from what his behaviour shows he wants,
  when they differ. That gap is the single most useful thing in this file.
- On money: describe his actual pattern (what he has given, when, after what),
  and what would plausibly move him further — grounded in that pattern, not in
  generic upsell logic. If he has never given beyond his pledge, say so and say
  what the material suggests is holding him back.
- On risk: is he drifting, testing her, settling in, or at the edge of leaving?
  What is the evidence?
- Openings must be CONCRETE and usable today: a specific thing to say, ask, or
  give him. Not "reconnect with him" — something she could send in a minute.
- No mystic or literary language. No therapy-speak. Short, plain, direct
  sentences. She is skimming this while answering a message.
- If he has barely interacted, say that in one line and keep every list short.
  Do not pad.

Lists: 2-5 items each, one short line per item.`;

/** The shape the API enforces, so the read can never arrive unreadable. */
const PROFILE_SCHEMA = {
  type: "object",
  properties: {
    portrait: {
      type: "string",
      description: "2-5 plain sentences on who he is and what he's here for.",
    },
    wants: {
      type: "array",
      items: { type: "string" },
      description: "What he is actually after, one short line each.",
    },
    respondsTo: {
      type: "array",
      items: { type: "string" },
      description: "What reliably works on him.",
    },
    avoid: {
      type: "array",
      items: { type: "string" },
      description: "What shuts him down, or what she should never say to him.",
    },
    money: {
      type: "string",
      description:
        "His actual giving pattern, and what would plausibly move him further.",
    },
    risk: {
      type: "string",
      description: "Drifting or not, and the evidence for it.",
    },
    openings: {
      type: "array",
      items: { type: "string" },
      description: "Concrete things she could say or do next, usable today.",
    },
  },
  required: [
    "portrait",
    "wants",
    "respondsTo",
    "avoid",
    "money",
    "risk",
    "openings",
  ],
} as const;

export function portraitConfigured(): boolean {
  return llmConfigured();
}

/** Gather everything he has ever written, plus the facts, as one document. */
async function materialFor(userId: string): Promise<{
  text: string;
  messageCount: number;
} | null> {
  const dossier = await subjectDossier(userId);
  if (!dossier) return null;

  const [thread] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(eq(threads.userId, userId))
    .limit(1);

  const msgs = thread
    ? await db
        .select({ sender: messages.sender, body: messages.body })
        .from(messages)
        .where(eq(messages.threadId, thread.id))
        .orderBy(messages.createdAt)
    : [];

  const comments = await db
    .select({ body: whisperComments.body, at: whisperComments.createdAt })
    .from(whisperComments)
    .where(eq(whisperComments.userId, userId))
    .orderBy(desc(whisperComments.createdAt))
    .limit(40);

  const parts = [`FACTS ABOUT HIM:\n${dossierBrief(dossier)}`];

  if (msgs.length) {
    // Trim from the oldest end so the current state of the relationship — the
    // part that decides what she does next — is never what gets dropped.
    const lines = msgs.map(
      (m) => `${m.sender === "goddess" ? "HER" : "HIM"}: ${m.body ?? ""}`,
    );
    let kept: string[] = [];
    let size = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i]!;
      if (size + l.length > 20000) {
        kept = [`[…${i + 1} earlier messages omitted…]`, ...kept];
        break;
      }
      kept = [l, ...kept];
      size += l.length;
    }
    parts.push(`THEIR WHOLE CONVERSATION (oldest first):\n${kept.join("\n")}`);
  } else {
    parts.push("THEIR CONVERSATION: they have never messaged each other.");
  }

  if (comments.length) {
    parts.push(
      `WHAT HE WROTE UNDER HER WHISPERS (newest first — these are unprompted, ` +
        `which makes them honest):\n${comments
          .map((c) => `- ${c.body}`)
          .join("\n")
          .slice(0, 6000)}`,
    );
  }

  return { text: parts.join("\n\n"), messageCount: msgs.length };
}

/** Re-read him and store the result. Carries the real reason on failure. */
export async function buildProfile(
  userId: string,
): Promise<{ profile: GeneratedProfile | null; reason?: string }> {
  const material = await materialFor(userId);
  if (!material) return { profile: null, reason: "No such subject." };

  const res = await askClaudeJson({
    system: BRIEF,
    user: `${material.text}\n\nWrite her file on him.`,
    maxTokens: 3000,
    purpose: "subject-profile",
    toolName: "write_file_on_him",
    toolDescription: "Hand her the working file on this member.",
    schema: PROFILE_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!res.ok) return { profile: null, reason: res.reason };

  const p = normalize(res.value);
  if (!p) {
    return {
      profile: null,
      reason: "The model gave a file with nothing in it. Try again.",
    };
  }

  const row = {
    userId,
    portrait: p.portrait,
    wants: p.wants,
    respondsTo: p.respondsTo,
    avoid: p.avoid,
    money: p.money,
    risk: p.risk,
    openings: p.openings,
    messagesSeen: material.messageCount,
    generatedAt: new Date(),
  };
  await db
    .insert(subjectProfiles)
    .values(row)
    .onConflictDoUpdate({ target: subjectProfiles.userId, set: row });

  return {
    profile: { ...p, messagesSeen: material.messageCount, generatedAt: row.generatedAt },
  };
}

function strList(v: unknown, max = 6): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 300))
    .slice(0, max);
}

function normalize(
  raw: unknown,
): Omit<GeneratedProfile, "messagesSeen" | "generatedAt"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const portrait =
    typeof o.portrait === "string" ? o.portrait.trim().slice(0, 2000) : "";
  if (!portrait) return null;
  return {
    portrait,
    wants: strList(o.wants),
    respondsTo: strList(o.respondsTo),
    avoid: strList(o.avoid),
    money: typeof o.money === "string" ? o.money.trim().slice(0, 1000) : "",
    risk: typeof o.risk === "string" ? o.risk.trim().slice(0, 1000) : "",
    openings: strList(o.openings),
  };
}
