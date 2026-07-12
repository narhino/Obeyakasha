/**
 * Chain of Obedience (A7) — PURE, unit-tested. A day is "kept" by ≥N seconds
 * listened or by typing the mantra. Keeping consecutive days extends the chain;
 * a gap resets it to 1. All dates are YYYY-MM-DD strings in the subject's tz.
 */
export interface ChainState {
  currentLen: number;
  bestLen: number;
  lastKeptDate: string | null;
}

/** YYYY-MM-DD one day before the given date string (UTC-safe string math). */
export function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Given the prior state and the day being kept, return the new state. */
export function nextChainState(prev: ChainState, today: string): ChainState {
  if (prev.lastKeptDate === today) {
    return prev; // already kept today — no change
  }
  let currentLen: number;
  if (prev.lastKeptDate === previousDay(today)) {
    currentLen = prev.currentLen + 1; // consecutive
  } else {
    currentLen = 1; // first day, or a gap resets
  }
  return {
    currentLen,
    bestLen: Math.max(prev.bestLen, currentLen),
    lastKeptDate: today,
  };
}

/** Local YYYY-MM-DD for a moment in a timezone. */
export function localDate(nowUtc: Date, timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    // en-CA formats as YYYY-MM-DD
    return fmt.format(nowUtc);
  } catch {
    return nowUtc.toISOString().slice(0, 10);
  }
}
