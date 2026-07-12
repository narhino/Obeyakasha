import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

/**
 * ADMIN-CONFIG settings store (PLAN §24.2). Typed defaults live here; the
 * Sanctum edits the DB rows. Values are cached 60s to avoid a query per read.
 */
export const SETTINGS_DEFAULTS = {
  commissions_open: false as boolean,
  grace_days: 3 as number,
  offline_ttl_days: 14 as number,
  chain_min_seconds: 300 as number,
  chain_mantra: "I obey. I belong to Akasha. 888." as string,
  msg_daily_limit: 5 as number,
  normalize_loudness: false as boolean,
  downloads_enabled: true as boolean,
  vault_gating: "soft" as "soft" | "hard",
  threshold_track_ids: [] as string[],
  quiet_hours_default: [22, 9] as [number, number],
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
