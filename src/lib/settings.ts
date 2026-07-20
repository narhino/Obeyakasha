import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { copy } from "@/copy/copy";

/**
 * ADMIN-CONFIG settings store (PLAN §24.2). Typed defaults live here; the
 * Sanctum edits the DB rows. Values are cached 60s to avoid a query per read.
 */
export const SETTINGS_DEFAULTS = {
  commissions_open: false as boolean,
  grace_days: 3 as number,
  offline_ttl_days: 14 as number,
  chain_min_seconds: 300 as number,
  // F5 · the mantra rite (the centrepiece of "Today's devotion" on the Mirror).
  // `mantra_text` is the line the subject types out in full to keep the chain;
  // `mantra_praise` is what she gives back the instant it seals. Both are hers
  // to change from Access at any time — the Mirror always reads the live values.
  // (Supersedes the former `chain_mantra` key; same default line.)
  mantra_text: "I obey. I belong to Akasha. 888." as string,
  mantra_praise: "Good subject." as string,
  msg_daily_limit: 5 as number,
  normalize_loudness: false as boolean,
  downloads_enabled: true as boolean,
  automations_enabled: false as boolean,
  vault_gating: "soft" as "soft" | "hard",
  threshold_track_ids: [] as string[],
  quiet_hours_default: [22, 9] as [number, number],
  // Content pipeline (ROADMAP-v1.5 C1.3). auto_pipeline chains
  // ingest → transcribe → organize; organize_auto_apply controls how much of
  // the organize proposal lands without review.
  auto_pipeline: true as boolean,
  organize_auto_apply: "tags_only" as "review_all" | "tags_only" | "everything",
  // Heavy dossier analysis (ROADMAP Phase D). When on and an API key is set,
  // the analyze job layers an LLM pass over the always-on heuristic floor.
  analysis_enabled: true as boolean,
  // Typical turnaround shown to commission buyers (ROADMAP-v1.5).
  commission_eta_days: 30 as number,
  // Auto-welcome DM on first connect (ROADMAP R9.9b). When on, a brand-new
  // subject's first sign-in lands her welcome as a real message in their thread
  // (which pushes "She spoke to you."). The text is hers to edit in Access.
  welcome_dm_enabled: true as boolean,
  welcome_dm_text: copy.messages.welcomeDefault as string,
  // The Oath (R9.5): unbroken chain days a subject must hold before the collar
  // petition unseals. Editable in Access. The monthly-gift track id and the
  // last-granted month stamp are dynamic keys (oath_gift_track_id /
  // oath_gift_last_granted) read via getRawSetting.
  oath_min_streak: 21 as number,
  // F1 "subjects bring their own files": whether subjects may bring their own
  // audio into their private shelf, and the per-file / per-subject ceilings.
  // She holds all three from Settings → "Their offerings".
  subject_uploads_enabled: true as boolean,
  subject_upload_max_mb: 100 as number,
  subject_upload_max_files: 20 as number,
  // F4 presence: the master switch for "the Goddess is on the app" (when off,
  // subjects never see her online); the cloak (she goes dark to subjects while
  // still seeing the room herself).
  presence_enabled: true as boolean,
  goddess_cloak: false as boolean,
  // F4 the threshold: mobile subjects must keep the app on their home screen and
  // her voice (push) allowed through, or the app takes over until they do. Off
  // lets mobile web through. Desktop and the goddess are never held.
  notification_jail_enabled: true as boolean,
};

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS;
export type SettingsShape = {
  [K in SettingsKey]: (typeof SETTINGS_DEFAULTS)[K];
};

type CacheEntry = { value: unknown; at: number };
const CACHE_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export async function getSetting<K extends SettingsKey>(
  key: K,
): Promise<SettingsShape[K]> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.value as SettingsShape[K];
  }
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  const value =
    row.length > 0 && row[0]!.value !== null && row[0]!.value !== undefined
      ? (row[0]!.value as SettingsShape[K])
      : (SETTINGS_DEFAULTS[key] as SettingsShape[K]);
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting<K extends SettingsKey>(
  key: K,
  value: SettingsShape[K],
): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
  cache.set(key, { value, at: Date.now() });
}

/** Test/worker helper — clears the in-process cache. */
export function clearSettingsCache() {
  cache.clear();
}

/**
 * Untyped accessors for dynamic keys that aren't part of the fixed
 * SETTINGS_DEFAULTS contract (e.g. discovered Patreon campaign id/tiers).
 */
export async function getRawSetting<T = unknown>(
  key: string,
  fallback: T,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value as T;
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  const value =
    row.length > 0 && row[0]!.value !== null && row[0]!.value !== undefined
      ? (row[0]!.value as T)
      : fallback;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setRawSetting(
  key: string,
  value: unknown,
): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
  cache.set(key, { value, at: Date.now() });
}
