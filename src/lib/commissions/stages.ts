/**
 * Commission production stages (ROADMAP-v1.5). The buyer sees a progress bar
 * built from these; prose is in Akasha's voice. Order = progression.
 */
export const COMMISSION_STAGES = [
  { key: "queued", pct: 8, admin: "Queued", buyer: "Yours is in my queue." },
  {
    key: "script",
    pct: 30,
    admin: "Script written",
    buyer: "I've written your script.",
  },
  {
    key: "voice",
    pct: 55,
    admin: "Voice recorded",
    buyer: "Your words are in my voice now.",
  },
  {
    key: "editing",
    pct: 78,
    admin: "Editing",
    buyer: "I'm shaping it for you.",
  },
  {
    key: "mastering",
    pct: 92,
    admin: "Final polish",
    buyer: "The final touches.",
  },
  { key: "delivered", pct: 100, admin: "Delivered", buyer: "It's yours." },
] as const;

export type CommissionStage = (typeof COMMISSION_STAGES)[number]["key"];

export function stageInfo(key: string): (typeof COMMISSION_STAGES)[number] {
  return COMMISSION_STAGES.find((s) => s.key === key) ?? COMMISSION_STAGES[0];
}

/** Days remaining against the typical turnaround, given the accepted date. */
export function daysLeft(
  acceptedAt: Date | null,
  etaDays: number,
): number | null {
  if (!acceptedAt) return null;
  const elapsed = (Date.now() - acceptedAt.getTime()) / 86_400_000;
  return Math.max(0, Math.round(etaDays - elapsed));
}
