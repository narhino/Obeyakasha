/**
 * The Descent (A6) — named ranks earned through consistency + completion.
 * PURE, unit-tested. Score blends files completed with chain length; the rank
 * is the highest tier whose threshold the score meets. Names use BRAND vocab.
 */
export interface Rank {
  name: string;
  minScore: number;
}

export const DESCENT: Rank[] = [
  { name: "Curious", minScore: 0 },
  { name: "Entranced", minScore: 3 },
  { name: "Collared", minScore: 10 },
  { name: "Conditioned", minScore: 25 },
  { name: "Devoted", minScore: 55 },
  { name: "888", minScore: 108 },
];

export function rankScore(filesCompleted: number, chainLen: number): number {
  return filesCompleted + Math.floor(chainLen / 2);
}

export function rankFor(
  filesCompleted: number,
  chainLen: number,
  ladder: Rank[] = DESCENT,
): { name: string; score: number; next: Rank | null } {
  const score = rankScore(filesCompleted, chainLen);
  const sorted = [...ladder].sort((a, b) => a.minScore - b.minScore);
  let current = sorted[0]!;
  let next: Rank | null = null;
  for (let i = 0; i < sorted.length; i++) {
    if (score >= sorted[i]!.minScore) {
      current = sorted[i]!;
      next = sorted[i + 1] ?? null;
    }
  }
  return { name: current.name, score, next };
}
