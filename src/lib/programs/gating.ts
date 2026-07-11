/**
 * Program unlock logic (PLAN §5.2, A8) — PURE and unit-tested.
 *
 * - open: every item is available.
 * - sequential: item i unlocks once item i-1 is completed.
 * - daily: like sequential, but a completed item's successor only unlocks
 *   24h after that completion (anticipation scheduling). The FIRST item is
 *   always available.
 *
 * Completion is tracked as a set of completed item indexes (0-based order).
 */
export type Gating = "open" | "sequential" | "daily";

export interface GateItem {
  /** 0-based position in the program order. */
  index: number;
  /** when this item was completed, if it has been (epoch ms). */
  completedAt?: number | null;
}

export interface GateResult {
  index: number;
  unlocked: boolean;
  /** for daily gating: when it will unlock, if currently time-locked (epoch ms). */
  unlocksAt?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeGates(
  gating: Gating,
  items: GateItem[],
  now: number,
): GateResult[] {
  const ordered = [...items].sort((a, b) => a.index - b.index);

  return ordered.map((item, i) => {
    if (gating === "open" || i === 0) {
      return { index: item.index, unlocked: true };
    }
    const prev = ordered[i - 1]!;
    const prevDone = prev.completedAt != null;
    if (!prevDone) {
      return { index: item.index, unlocked: false };
    }
    if (gating === "sequential") {
      return { index: item.index, unlocked: true };
    }
    // daily: 24h after the previous item's completion
    const unlocksAt = (prev.completedAt as number) + DAY_MS;
    if (now >= unlocksAt) {
      return { index: item.index, unlocked: true };
    }
    return { index: item.index, unlocked: false, unlocksAt };
  });
}
