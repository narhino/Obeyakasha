import type {
  OrganizeInput,
  OrganizeProposal,
  TagProposal,
  TriggerProposal,
} from "./types";

/**
 * Heuristic organizer (PLAN §8.3) — no external AI. Derives proposals from
 * Akasha's real title conventions ([F4M], [FDOM], [Hypnosis], [Sleep]…) plus
 * keyword matches in the transcript, and finds known triggers with timestamps.
 * Always available; the LLM pass (when configured) adds to these.
 */

// Title bracket tokens → tags.
const BRACKET_TAGS: Record<string, TagProposal> = {
  hypnosis: { kind: "format", value: "pure hypnosis" },
  "asmr rp": { kind: "format", value: "roleplay" },
  rp: { kind: "format", value: "roleplay" },
  fdom: { kind: "theme", value: "femdom" },
  femdom: { kind: "theme", value: "femdom" },
  sleep: { kind: "purpose", value: "sleep" },
  bimbo: { kind: "theme", value: "transformation" },
  "positive programming": { kind: "purpose", value: "conditioning" },
};

// Transcript/title keyword → tag.
const KEYWORD_TAGS: { re: RegExp; tag: TagProposal }[] = [
  { re: /\bchastity|locked|cage\b/i, tag: { kind: "theme", value: "chastity" } },
  { re: /\bobey|obedience|kneel\b/i, tag: { kind: "theme", value: "obedience" } },
  { re: /\bdevotion|devoted|worship\b/i, tag: { kind: "theme", value: "devotion" } },
  { re: /\btransform|doll|puppy|puppet\b/i, tag: { kind: "theme", value: "transformation" } },
  { re: /\bedg(e|ing)\b/i, tag: { kind: "purpose", value: "conditioning" } },
  { re: /\bdeeper|drop|under|trance\b/i, tag: { kind: "purpose", value: "deepening" } },
  { re: /\bbreathe|breathing|relax\b/i, tag: { kind: "purpose", value: "induction" } },
];

function dedupeTags(tags: TagProposal[]): TagProposal[] {
  const seen = new Set<string>();
  const out: TagProposal[] = [];
  for (const t of tags) {
    const key = `${t.kind}:${t.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function findEvidence(
  phrase: string,
  segments: OrganizeInput["segments"],
): { start: number; end: number; phrase: string }[] {
  const p = phrase.toLowerCase();
  const hits = segments
    .filter((s) => s.text.toLowerCase().includes(p))
    .slice(0, 3)
    .map((s) => ({ start: s.start, end: s.end, phrase: s.text.trim() }));
  return hits;
}

export function heuristicOrganize(input: OrganizeInput): OrganizeProposal {
  const haystack = `${input.title}\n${input.description ?? ""}\n${input.fullText}`;
  const tags: TagProposal[] = [];

  // Bracket tokens in the title.
  for (const m of input.title.matchAll(/\[([^\]]+)\]/g)) {
    const token = m[1]!.trim().toLowerCase();
    const tag = BRACKET_TAGS[token];
    if (tag) tags.push(tag);
  }
  // Keyword scan.
  for (const { re, tag } of KEYWORD_TAGS) {
    if (re.test(haystack)) tags.push(tag);
  }
  // Default: everything is at least a session with an induction.
  if (!tags.some((t) => t.kind === "purpose")) {
    tags.push({ kind: "purpose", value: "induction" });
  }

  // Known triggers appearing in the transcript.
  const triggers: TriggerProposal[] = [];
  const lowerText = input.fullText.toLowerCase();
  for (const trig of input.knownTriggers) {
    const name = trig.name.toLowerCase();
    if (name.length < 3) continue;
    if (lowerText.includes(name)) {
      const evidence = findEvidence(trig.name, input.segments);
      // "your trigger" / "when I say" nearby suggests installation.
      const installs = /your trigger|when i say|from now on|anchor/i.test(
        input.fullText,
      );
      triggers.push({
        name: trig.name,
        relation: installs ? "installs" : "reinforces",
        evidence,
        confidence: 0.5,
      });
    }
  }

  // Program/playlist suggestion from title patterns.
  const playlists: OrganizeProposal["playlists"] = [];
  if (/training session\s*\d+/i.test(input.title)) {
    playlists.push({ target: "Training Sessions", reason: "title pattern" });
  }
  if (/locked by akasha|day\s*\d+|chastity/i.test(input.title)) {
    playlists.push({ target: "30 Days Chastity", reason: "title pattern" });
  }
  if (/servant training academy/i.test(input.title)) {
    playlists.push({ target: "Servant Training Academy", reason: "title pattern" });
  }

  return { tags: dedupeTags(tags), triggers, playlists };
}
