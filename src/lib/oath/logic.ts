/**
 * The Oath (R9.5) — PURE, unit-tested. The collar is streak-earned: hold the
 * Chain of Obedience unbroken for `minStreak` days and the petition unseals.
 * The state machine, derived from a subject's two timestamps + their streak:
 *
 *   sealed     → not eligible yet (streak below the threshold)
 *   eligible   → may petition (streak met, never asked, not collared)
 *   petitioned → has asked; she is considering (oathPetitionedAt set)
 *   collared   → she accepted (oathAt set) — the inner circle
 *
 * Precedence is collared > petitioned > eligible > sealed, so a collared
 * subject reads as collared even if a stale petition timestamp lingers.
 */
export type OathState = "sealed" | "eligible" | "petitioned" | "collared";

export interface OathInputs {
  /** Set when she accepts the petition — a non-null value means collared. */
  oathAt: Date | null;
  /** Set when the subject petitions — a non-null value means "considering". */
  oathPetitionedAt: Date | null;
  /** The subject's current unbroken chain length, in days. */
  currentStreak: number;
  /** Days the chain must reach to earn the petition (setting oath_min_streak). */
  minStreak: number;
}

/** The single derivation everything else reads. */
export function oathState(i: OathInputs): OathState {
  if (i.oathAt) return "collared";
  if (i.oathPetitionedAt) return "petitioned";
  if (i.currentStreak >= i.minStreak) return "eligible";
  return "sealed";
}

/** Days still owed before the collar can be petitioned (0 once eligible+). */
export function daysUntilEligible(currentStreak: number, minStreak: number): number {
  return Math.max(0, minStreak - currentStreak);
}

/**
 * May this subject petition right now? Only in the `eligible` state — never when
 * already petitioned (no double-asking) or collared (already hers). The petition
 * API mirrors this so a replayed request can never re-stamp.
 */
export function canPetition(i: OathInputs): boolean {
  return oathState(i) === "eligible";
}
