/**
 * Filename ↔ shell-title matcher (ROADMAP-v1.5 R8). Pure, dependency-free.
 *
 * Patreon can't hand us post audio, so imported posts land as shells (title +
 * description, no audio). On the bulk-attach screen the goddess drops many audio
 * files at once; this proposes which file belongs to which waiting shell by
 * fuzzy-matching the filename against the shell title.
 *
 * Scoring blends two signals, each 0..1:
 *   - token overlap (Sørensen–Dice on the word sets) — the dominant signal,
 *     because her titles and her filenames share the meaningful words
 *     ("Locked", "Akasha", "Day", "3");
 *   - character-bigram similarity (Sørensen–Dice) — a softer signal that
 *     rewards near-spellings and survives a missing/extra word.
 * The greedy assignment then takes the highest-scoring pairs first and never
 * reuses a file or a shell (one file → one shell), so a confident pair claims
 * its shell before a weaker contender can.
 */

/** Known audio extensions we strip from a filename before matching. */
const EXT_RE = /\.(mp3|m4a|mp4|wav|aac|ogg|flac|opus|wma|aif|aiff)$/i;

/** Weight of token-overlap vs bigram similarity in the blended score. */
const TOKEN_WEIGHT = 0.6;
const BIGRAM_WEIGHT = 0.4;

/** Score at/above which a proposed pair is shown as a confident match. */
export const HIGH_CONFIDENCE = 0.55;
/** Score below which we don't propose a pair at all (the file is unmatched). */
export const MATCH_FLOOR = 0.2;

export type MatchConfidence = "high" | "uncertain" | "none";

export interface MatchProposal {
  /** Index of the file in the input `fileNames` array. */
  fileIndex: number;
  fileName: string;
  /** The proposed shell, or null when nothing cleared the floor. */
  shellId: string | null;
  /** Blended score for the proposed pair (0 when unmatched). */
  score: number;
  confidence: MatchConfidence;
}

/** Lowercase, drop punctuation/underscores/dashes, collapse whitespace. */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Like {@link normalizeTitle} but first strips a trailing audio extension. */
export function normalizeFilename(name: string): string {
  return normalizeTitle(name.replace(EXT_RE, ""));
}

function tokens(normalized: string): string[] {
  return normalized ? normalized.split(" ").filter(Boolean) : [];
}

/** Sørensen–Dice over two word SETS: 2·|A∩B| / (|A|+|B|). */
function tokenDice(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  return (2 * intersection) / (setA.size + setB.size);
}

/** Character bigram multiset of a normalized string (spaces removed). */
function bigrams(normalized: string): Map<string, number> {
  const compact = normalized.replace(/ /g, "");
  const out = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const g = compact.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice over two bigram multisets. */
function bigramDice(a: string, b: string): number {
  const ba = bigrams(a);
  const bb = bigrams(b);
  let sizeA = 0;
  let sizeB = 0;
  for (const v of ba.values()) sizeA += v;
  for (const v of bb.values()) sizeB += v;
  if (sizeA === 0 || sizeB === 0) return 0;
  let intersection = 0;
  for (const [g, av] of ba) {
    const bv = bb.get(g);
    if (bv) intersection += Math.min(av, bv);
  }
  return (2 * intersection) / (sizeA + sizeB);
}

/**
 * Similarity of one filename to one shell title, 0..1. Blends token overlap
 * (weighted higher) with character-bigram similarity. Order-independent.
 */
export function scoreMatch(fileName: string, title: string): number {
  const f = normalizeFilename(fileName);
  const t = normalizeTitle(title);
  if (!f || !t) return 0;
  const token = tokenDice(tokens(f), tokens(t));
  const bigram = bigramDice(f, t);
  return TOKEN_WEIGHT * token + BIGRAM_WEIGHT * bigram;
}

/**
 * Propose one shell per dropped file. Greedy by score: every file↔shell pair
 * that clears {@link MATCH_FLOOR} is ranked, then assigned highest-first so
 * neither the file nor the shell is claimed twice. Returns one proposal per
 * input file, in input order; files that win nothing come back `shellId: null`.
 */
export function proposeMatches(
  fileNames: string[],
  shells: { id: string; title: string }[],
): MatchProposal[] {
  const candidates: { fileIndex: number; shellId: string; score: number }[] = [];
  for (let i = 0; i < fileNames.length; i++) {
    for (const shell of shells) {
      const score = scoreMatch(fileNames[i]!, shell.title);
      if (score >= MATCH_FLOOR) {
        candidates.push({ fileIndex: i, shellId: shell.id, score });
      }
    }
  }
  // Highest score first; stable tie-break so the result is deterministic.
  candidates.sort(
    (a, b) => b.score - a.score || a.fileIndex - b.fileIndex,
  );

  const takenFiles = new Set<number>();
  const takenShells = new Set<string>();
  const chosen = new Map<number, { shellId: string; score: number }>();
  for (const c of candidates) {
    if (takenFiles.has(c.fileIndex) || takenShells.has(c.shellId)) continue;
    takenFiles.add(c.fileIndex);
    takenShells.add(c.shellId);
    chosen.set(c.fileIndex, { shellId: c.shellId, score: c.score });
  }

  return fileNames.map((fileName, fileIndex) => {
    const pick = chosen.get(fileIndex);
    if (!pick) {
      return { fileIndex, fileName, shellId: null, score: 0, confidence: "none" };
    }
    return {
      fileIndex,
      fileName,
      shellId: pick.shellId,
      score: pick.score,
      confidence: pick.score >= HIGH_CONFIDENCE ? "high" : "uncertain",
    };
  });
}
