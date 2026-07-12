/**
 * Safety triage (PLAN §13.8 / A20) — PURE, unit-tested. A fast keyword-based
 * classifier flags messages that Akasha must handle personally (never AI-
 * drafted). Deliberately high-recall: false positives just add a banner.
 */
export type TriageFlag = "crisis" | "distress" | "age" | "none";

const CRISIS = [
  /\bsuicid/i,
  /\bkill myself\b/i,
  /\bend (my|it all)\b/i,
  /\bself[- ]?harm\b/i,
  /\bhurt myself\b/i,
  /\bwant to die\b/i,
  /\boverdose\b/i,
];

const DISTRESS = [
  /\bcan'?t cope\b/i,
  /\bbreaking down\b/i,
  /\bpanic attack\b/i,
  /\bscared\b/i,
  /\bunsafe\b/i,
  /\bin danger\b/i,
  /\btrauma\b/i,
  /\btriggered\b.*\b(badly|bad|scared)\b/i,
];

const AGE = [/\b(i'?m|i am)\s?1[0-7]\b/i, /\bunder ?age\b/i, /\bnot 18\b/i, /\bminor\b/i];

export function triageMessage(body: string): TriageFlag {
  for (const re of CRISIS) if (re.test(body)) return "crisis";
  for (const re of AGE) if (re.test(body)) return "age";
  for (const re of DISTRESS) if (re.test(body)) return "distress";
  return "none";
}

/** Any non-"none" flag means: pin to top, no AI draft offered. */
export function needsPersonalHandling(flag: TriageFlag): boolean {
  return flag !== "none";
}
