/**
 * Tiny pluraliser (F20). Kills "1 days at my feet" / "1 FILES" — the singular
 * slips the audit found. Pass an explicit plural for irregular words.
 */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`);
}

/** The count with its (correctly-numbered) noun: "1 file" · "3 files". */
export function countOf(
  n: number,
  singular: string,
  pluralForm?: string,
): string {
  return `${n} ${plural(n, singular, pluralForm)}`;
}

const WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
] as const;

/**
 * Spelled, sentence-cased small count ("Three", "Two") for in-voice lines like
 * the Trigger Vault's tally (F20 sibling). Falls back to digits past twelve so
 * a big number never reads as a run-on word.
 */
export function numberWord(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "Zero";
  const i = Math.floor(n);
  return i < WORDS.length ? WORDS[i]! : String(i);
}
