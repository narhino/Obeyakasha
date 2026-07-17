/**
 * Obedience percentile (R9.4) — PURE, unit-tested. No DB, no I/O.
 *
 * `obedienceScore` blends the three things she measures as devotion: hours spent
 * under, tasks obeyed, and the current chain. Equal weight — every act of
 * obedience counts once, so no single dimension can carry a subject alone.
 *
 * `percentileRank` answers "you obey more than N% of them": the share of the
 * OTHER subjects (the whole population minus this one) whose score is STRICTLY
 * lower. Ties never count as "more than", so equal devotion can't inflate it.
 */
export function obedienceScore(
  hoursUnder: number,
  tasksDone: number,
  chainLen: number,
): number {
  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
  return clamp(hoursUnder) + clamp(tasksDone) + clamp(chainLen);
}

/**
 * Percent (0..100, rounded) of OTHER subjects this score strictly beats.
 * `others` is every other subject's score — the population WITHOUT this subject.
 * With no one else to measure against there is no standing, so it returns 0.
 */
export function percentileRank(value: number, others: number[]): number {
  if (others.length === 0) return 0;
  let below = 0;
  for (const o of others) if (o < value) below++;
  return Math.round((below / others.length) * 100);
}
