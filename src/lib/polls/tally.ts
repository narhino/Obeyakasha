/** Poll tally (A24) — PURE, unit-tested. */
export interface PollOption {
  id: string;
  label: string;
}

export interface Tally {
  optionId: string;
  label: string;
  count: number;
  pct: number;
}

export function tallyVotes(
  options: PollOption[],
  votes: { optionId: string }[],
): { results: Tally[]; total: number; winnerId: string | null } {
  const counts = new Map<string, number>();
  for (const o of options) counts.set(o.id, 0);
  for (const v of votes) {
    if (counts.has(v.optionId)) counts.set(v.optionId, counts.get(v.optionId)! + 1);
  }
  const total = votes.filter((v) => counts.has(v.optionId)).length;
  const results: Tally[] = options.map((o) => {
    const count = counts.get(o.id) ?? 0;
    return {
      optionId: o.id,
      label: o.label,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
  let winnerId: string | null = null;
  let best = -1;
  for (const r of results) {
    if (r.count > best) {
      best = r.count;
      winnerId = r.optionId;
    } else if (r.count === best) {
      winnerId = winnerId; // tie keeps the first (stable)
    }
  }
  if (total === 0) winnerId = null;
  return { results, total, winnerId };
}
