/**
 * The mantra rite (F5) — PURE, unit-tested. The subject types her mantra out in
 * full to keep the chain. Two concerns live here:
 *
 *  - `normalizeMantra` / `mantraMatches`: the forgiving completion check. Case-
 *    insensitive, internal whitespace collapsed, leading/trailing space trimmed,
 *    trailing punctuation dropped — so "I OBEY.  I belong to Akasha. 888" seals
 *    the same as the engraved line. Internal punctuation still counts (she wrote
 *    it that way); only the trailing flourish is forgiven.
 *  - `litLength`: how many characters of the target the ghost line has ignited
 *    for what the subject has typed so far — a forgiving left-to-right walk that
 *    tolerates case and any run of whitespace. Presentation only.
 *
 * No DB, no React — imported by the rite component and the (sole) F5 test.
 */

/** Lowercase, collapse inner whitespace, trim, drop trailing punctuation. */
export function normalizeMantra(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\p{L}\p{N}]+$/u, "");
}

/** Does the typed line satisfy the mantra, under forgiving normalization? */
export function mantraMatches(typed: string, target: string): boolean {
  const t = normalizeMantra(target);
  // An all-punctuation / empty target can never be "said" — guard against a
  // blank setting sealing on the first keystroke.
  if (t.length === 0) return false;
  return normalizeMantra(typed) === t;
}

/**
 * How many characters of `target` should read as ignited for `typed` so far.
 * A forgiving prefix walk: case-insensitive, and any whitespace in the target
 * is satisfied by any (or no) whitespace typed. Stops at the first real
 * mismatch. Invisible trailing target space may advance past a boundary; a
 * visible character never lights until it is actually typed.
 */
export function litLength(typed: string, target: string): number {
  const t = typed.toLowerCase();
  const g = target.toLowerCase();
  let ti = 0;
  let gi = 0;
  while (gi < g.length && ti < t.length) {
    const gc = g[gi]!;
    const tc = t[ti]!;
    if (gc === tc) {
      ti++;
      gi++;
      continue;
    }
    if (/\s/.test(gc)) {
      // Target wants a break here; consume any run of typed whitespace.
      gi++;
      while (ti < t.length && /\s/.test(t[ti]!)) ti++;
      continue;
    }
    if (/\s/.test(tc)) {
      // Stray whitespace in what they typed — skip it, keep comparing.
      ti++;
      continue;
    }
    break;
  }
  return gi;
}
