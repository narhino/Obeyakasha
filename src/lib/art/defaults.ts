/**
 * Art resolver (DESIGN-DIRECTION §D1). PURE — no DB, no media provider, safe to
 * import from client or server. Maps a track's tag values onto one of the
 * bespoke cover families in `public/art/covers/`, so every track shows real art
 * even when it carries no custom upload.
 *
 * The display chain the app wires around this (see src/lib/art/resolve.ts):
 *   custom artworkKey (signed) → defaultCoverFor(track tags) → default.jpg
 * Collections (series / programs / playlists): artworkKey → collection.jpg.
 */

export type CoverFamily =
  | "collar"
  | "worship"
  | "obedience"
  | "blank"
  | "denial"
  | "addiction"
  | "transformation"
  | "tribute"
  | "praise"
  | "sleep"
  | "ritual"
  | "trance"
  | "default";

/**
 * Fixed priority order (DESIGN-DIRECTION §D1). The first family whose tag set
 * intersects the track's tags wins. Theme families sit above the three
 * format/purpose families (sleep · ritual · trance), so a track's theme
 * ("chastity" → denial) always outranks its format ("hypnosis" → trance) — this
 * ordering IS how "theme tags outrank format/purpose" is enforced.
 */
const PRIORITY: Exclude<CoverFamily, "default">[] = [
  "collar",
  "worship",
  "obedience",
  "blank",
  "denial",
  "addiction",
  "transformation",
  "tribute",
  "praise",
  "sleep",
  "ritual",
  "trance",
];

/**
 * Which lowercase tag values map to each family (DESIGN-DIRECTION §D1 table).
 * Matching is exact against a lowercased tag value, so "conditioning" (addiction)
 * and "conditioning session" (ritual) stay distinct.
 */
const FAMILY_TAGS: Record<Exclude<CoverFamily, "default">, readonly string[]> = {
  collar: ["collar", "ownership"],
  worship: ["worship", "devotion", "goddess worship"],
  obedience: [
    "obedience",
    "submission",
    "protocol",
    "discipline",
    "service",
    "surrender",
  ],
  blank: ["mindlessness", "blank", "drone", "brainwashing", "mind control"],
  denial: [
    "chastity",
    "denial",
    "tease and denial",
    "orgasm control",
    "edging",
  ],
  addiction: [
    "obsession",
    "addiction",
    "conditioning",
    "reinforcement",
    "trigger install",
  ],
  transformation: [
    "bimbofication",
    "dollification",
    "transformation",
    "pet play",
    "good boy",
    "good girl",
  ],
  praise: [
    "praise",
    "acceptance",
    "confidence",
    "self-love",
    "relaxation",
    "gentle",
  ],
  tribute: ["findom", "tribute"],
  sleep: ["sleep", "nap", "sleep aid"],
  ritual: [
    "ritual",
    "daily task",
    "mantra",
    "affirmations",
    "conditioning session",
    "training session",
    "check-in",
  ],
  trance: [
    "hypnosis",
    "induction",
    "deepening",
    "story",
    "trance",
    "binaural",
    "subliminal",
  ],
};

/** Reverse index: lowercase tag value → family, built once at module load. */
const VALUE_TO_FAMILY = new Map<string, Exclude<CoverFamily, "default">>();
for (const family of PRIORITY) {
  for (const value of FAMILY_TAGS[family]) {
    // First family in priority order to claim a value keeps it (no collisions
    // exist in the table today, but priority order is the tiebreak by design).
    if (!VALUE_TO_FAMILY.has(value)) VALUE_TO_FAMILY.set(value, family);
  }
}

/**
 * Resolve a track's tag values to a cover family (DESIGN-DIRECTION §D1).
 * Case-insensitive; unmatched (or empty) → "default".
 */
export function coverFamilyForTags(tags: readonly string[]): CoverFamily {
  const present = new Set<Exclude<CoverFamily, "default">>();
  for (const raw of tags) {
    const family = VALUE_TO_FAMILY.get(raw.trim().toLowerCase());
    if (family) present.add(family);
  }
  if (present.size === 0) return "default";
  for (const family of PRIORITY) {
    if (present.has(family)) return family;
  }
  return "default";
}

/** Base path for the immutable committed cover art. */
const COVERS = "/art/covers";

/** The immutable fallback cover for any track with no matching family. */
export const DEFAULT_COVER = `${COVERS}/default.jpg`;
/** The default cover for a series / program / playlist. */
export const COLLECTION_COVER = `${COVERS}/collection.jpg`;

/** Full-bleed art for signature surfaces (DESIGN-DIRECTION §D1). */
export const HERO_IMAGE = "/art/hero.jpg";
export const GATE_IMAGE = "/art/gate.jpg";
export const EMPTY_IMAGE = "/art/empty.jpg";

/**
 * The `/art/covers/<family>.jpg` path for a track's tags. Never returns an empty
 * box — an unmatched track resolves to the default sigil cover.
 */
export function defaultCoverFor(tags: readonly string[]): string {
  return `${COVERS}/${coverFamilyForTags(tags)}.jpg`;
}
