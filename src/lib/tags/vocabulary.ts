/**
 * Starter vocabulary for the femdom erotic-hypnosis field (ROADMAP-v1.5). Seeded
 * into the `tags` table so tagging offers a real, in-field palette from day one;
 * fully editable in the Sanctum. `format` doubles as the file "category"
 * (hypnosis, story/trance, daily task, …). Framing: hypnotherapy with erotic
 * energy — never pornographic.
 */

export type TagKind = "format" | "theme" | "purpose" | "intensity";

export const VOCABULARY: Record<TagKind, string[]> = {
  // "Categories" — the type of file.
  format: [
    "hypnosis",
    "story / trance",
    "guided meditation",
    "daily task",
    "ritual",
    "affirmations",
    "mantra",
    "conditioning session",
    "sleep",
    "nap",
    "wake / emergence",
    "spoken word",
    "ambient / soundscape",
    "binaural",
    "subliminal",
    "check-in",
    "training session",
  ],
  // What it's about.
  theme: [
    "femdom",
    "submission",
    "obedience",
    "devotion",
    "worship",
    "service",
    "surrender",
    "ownership",
    "collar",
    "protocol",
    "discipline",
    "chastity",
    "denial",
    "tease and denial",
    "orgasm control",
    "edging",
    "conditioning",
    "brainwashing",
    "mind control",
    "mindlessness",
    "blank",
    "drone",
    "obsession",
    "addiction",
    "bimbofication",
    "dollification",
    "transformation",
    "pet play",
    "good boy",
    "good girl",
    "praise",
    "humiliation",
    "findom",
    "tribute",
    "goddess worship",
    "acceptance",
    "confidence",
    "relaxation",
    "self-love",
  ],
  // What it does.
  purpose: [
    "induction",
    "deepening",
    "conditioning",
    "trigger install",
    "reinforcement",
    "maintenance",
    "awakening",
    "emergence",
    "sleep aid",
    "confidence building",
  ],
  // How deep / how strong.
  intensity: [
    "gentle",
    "soft",
    "medium",
    "deep",
    "intense",
    "beginner-friendly",
    "advanced",
  ],
};

/** Flat list of {kind, value} for seeding / suggestions. */
export function vocabularyEntries(): { kind: TagKind; value: string }[] {
  return (Object.keys(VOCABULARY) as TagKind[]).flatMap((kind) =>
    VOCABULARY[kind].map((value) => ({ kind, value })),
  );
}
