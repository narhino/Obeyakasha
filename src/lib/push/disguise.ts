/**
 * Secret mode — the disguised push pool (R6).
 *
 * DELIBERATE EXCEPTION TO THE VOICE RULE. Every other subject-facing string on
 * this platform lives in `src/copy/copy.ts` and is written in Akasha's voice.
 * These do the opposite ON PURPOSE: when a subject turns on Secret mode, the
 * words that reach their lock screen must be utterly mundane — the kind of
 * notification anyone glancing over their shoulder would ignore. In her voice
 * they would defeat the whole point. So the pool lives here, generic and
 * family-safe, and never touches copy.ts. (Logged in docs/DECISIONS.log.md.)
 *
 * The rewrite happens at the single push send choke point (`sendToDevice` in
 * ./send.ts): only the title / body / icon are replaced. The deep link and tag
 * are preserved, so tapping the notification still opens the real app.
 */

/** Neutral, non-brand app icon shown on disguised notifications + the disguised manifest. */
export const DISGUISE_ICON = "/icons/disguise.svg";

export interface DisguiseMessage {
  title: string;
  body: string;
}

/**
 * The rotating pool of innocuous messages. Intentionally boring: reminders,
 * weather, generic "daily" reads. No brand, no voice, nothing suggestive.
 */
export const DISGUISE_MESSAGES: DisguiseMessage[] = [
  { title: "Reminder", body: "Drink some water today." },
  { title: "Weather", body: "Clear skies tomorrow." },
  { title: "Daily", body: "Your streak is waiting." },
  { title: "Reminder", body: "Time to stretch for a minute." },
  { title: "News", body: "Your morning briefing is ready." },
  { title: "Calendar", body: "Nothing scheduled for today." },
  { title: "Steps", body: "You're close to your step goal." },
  { title: "Weather", body: "Light rain expected this evening." },
  { title: "Reminder", body: "Don't forget to charge your devices." },
  { title: "Daily", body: "A new tip is waiting for you." },
];

/** Pick a pool index from a seed. Exported so the choke point + tests are deterministic. */
export function pickDisguiseIndex(seed: number): number {
  const n = DISGUISE_MESSAGES.length;
  return ((Math.trunc(seed) % n) + n) % n;
}

/**
 * Rewrite a push payload into its disguised form. PURE and unit-tested.
 *
 * Generic over the payload shape so it never has to import the server-only
 * push module: it overrides `title` / `body` / `icon` and spreads everything
 * else through untouched — crucially the deep link and tag, so the tap target
 * is unchanged. Rotates through the pool by `seed` (defaults to wall-clock time
 * so successive disguised pushes vary).
 */
export function disguisePayload<
  T extends { title: string; body?: string; icon?: string },
>(payload: T, seed: number = Date.now()): T {
  const msg = DISGUISE_MESSAGES[pickDisguiseIndex(seed)]!;
  return { ...payload, title: msg.title, body: msg.body, icon: DISGUISE_ICON };
}
