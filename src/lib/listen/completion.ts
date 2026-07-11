/** Completion threshold (PLAN §9): a listen counts as complete at ≥85% heard. */
export const COMPLETION_RATIO = 0.85;

export function isComplete(
  maxPositionS: number,
  durationS: number | null | undefined,
): boolean {
  if (!durationS || durationS <= 0) return false;
  return maxPositionS / durationS >= COMPLETION_RATIO;
}
