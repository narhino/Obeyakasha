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
