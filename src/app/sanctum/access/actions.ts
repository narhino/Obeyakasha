"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { tierMappings } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { clearSettingsCache } from "@/lib/settings";

const mappingSchema = z.object({
  patreonTierId: z.string().min(1),
  label: z.string().min(1).max(120),
  accessLevel: z.coerce.number().int().min(0).max(99),
  sort: z.coerce.number().int().default(0),
});

/** Upsert one tier→level mapping (ADMIN-CONFIG, PLAN §6.2). */
export async function saveTierMapping(formData: FormData) {
  const session = await requireGoddess();
  const parsed = mappingSchema.safeParse({
    patreonTierId: formData.get("patreonTierId"),
    label: formData.get("label"),
    accessLevel: formData.get("accessLevel"),
    sort: formData.get("sort") ?? 0,
  });
  if (!parsed.success) {
    throw new Error("Invalid tier mapping input");
  }
  const { patreonTierId, label, accessLevel, sort } = parsed.data;

  await db
    .insert(tierMappings)
    .values({ patreonTierId, label, accessLevel, sort })
    .onConflictDoUpdate({
      target: tierMappings.patreonTierId,
      set: { label, accessLevel, sort, updatedAt: new Date() },
    });

  clearSettingsCache();
  await logAudit(session.user.id, "tier_mapping.saved", {
    patreonTierId,
    accessLevel,
    label,
  });
  revalidatePath("/sanctum/access");
}

/** Toggle a boolean feature setting (automations, downloads, auto-pipeline). */
export async function toggleSetting(formData: FormData) {
  const session = await requireGoddess();
  const key = String(formData.get("key"));
  const allowed = [
    "automations_enabled",
    "downloads_enabled",
    "auto_pipeline",
    "analysis_enabled",
    "welcome_dm_enabled",
    "subject_uploads_enabled",
    // F4 presence + the threshold.
    "presence_enabled",
    "goddess_cloak",
    "notification_jail_enabled",
  ] as const;
  if (!(allowed as readonly string[]).includes(key)) throw new Error("bad key");
  const { getSetting, setSetting } = await import("@/lib/settings");
  const k = key as (typeof allowed)[number];
  const current = await getSetting(k);
  await setSetting(k, !current);
  await logAudit(session.user.id, "setting.toggled", { key, value: !current });
  revalidatePath("/sanctum/access");
}

const patreonUrlSchema = z.object({
  url: z.string().trim().url().max(500),
});

/** Set the Patreon page URL used by the public catalog's Upgrade CTA (R2a). */
export async function setPatreonPageUrl(formData: FormData) {
  const session = await requireGoddess();
  const parsed = patreonUrlSchema.safeParse({ url: formData.get("url") });
  if (!parsed.success) {
    throw new Error("Invalid Patreon page URL");
  }
  const { setRawSetting } = await import("@/lib/settings");
  await setRawSetting("patreon_page_url", parsed.data.url);
  await logAudit(session.user.id, "setting.patreon_page_url", {
    url: parsed.data.url,
  });
  revalidatePath("/sanctum/access");
}

const welcomeTextSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

/** Edit the auto-welcome DM text sent to new subjects on first connect (R9.9b). */
export async function setWelcomeDmText(formData: FormData) {
  const session = await requireGoddess();
  const parsed = welcomeTextSchema.safeParse({ text: formData.get("text") });
  if (!parsed.success) {
    throw new Error("Give the welcome some words (up to 500).");
  }
  const { setSetting } = await import("@/lib/settings");
  await setSetting("welcome_dm_text", parsed.data.text);
  await logAudit(session.user.id, "setting.welcome_dm_text", {});
  revalidatePath("/sanctum/access");
}

const oathStreakSchema = z.object({
  minStreak: z.coerce.number().int().min(1).max(3650),
});

/** Set the unbroken-days a subject must hold before the collar unseals (R9.5). */
export async function setOathMinStreak(formData: FormData) {
  const session = await requireGoddess();
  const parsed = oathStreakSchema.safeParse({
    minStreak: formData.get("minStreak"),
  });
  if (!parsed.success) throw new Error("Give a whole number of days (1–3650).");
  const { setSetting } = await import("@/lib/settings");
  await setSetting("oath_min_streak", parsed.data.minStreak);
  await logAudit(session.user.id, "setting.oath_min_streak", {
    value: parsed.data.minStreak,
  });
  revalidatePath("/sanctum/access");
}

/** Set (or clear) the track gifted to the collared each month (R9.5). Empty clears. */
export async function setOathGiftTrack(formData: FormData) {
  const session = await requireGoddess();
  const raw = String(formData.get("trackId") ?? "").trim();
  const trackId = raw === "" ? null : raw;
  if (trackId && !/^[0-9a-f-]{36}$/i.test(trackId)) {
    throw new Error("Pick a track, or clear it.");
  }
  const { setRawSetting } = await import("@/lib/settings");
  await setRawSetting("oath_gift_track_id", trackId);
  await logAudit(session.user.id, "setting.oath_gift_track_id", { trackId });
  revalidatePath("/sanctum/access");
}

const uploadLimitsSchema = z.object({
  maxMb: z.coerce.number().int().min(1).max(2000),
  maxFiles: z.coerce.number().int().min(0).max(1000),
});

/** Set the per-file (MB) and per-subject (count) ceilings for subject uploads (F1). */
export async function setSubjectUploadLimits(formData: FormData) {
  const session = await requireGoddess();
  const parsed = uploadLimitsSchema.safeParse({
    maxMb: formData.get("maxMb"),
    maxFiles: formData.get("maxFiles"),
  });
  if (!parsed.success) throw new Error("Give whole-number limits.");
  const { setSetting } = await import("@/lib/settings");
  await setSetting("subject_upload_max_mb", parsed.data.maxMb);
  await setSetting("subject_upload_max_files", parsed.data.maxFiles);
  await logAudit(session.user.id, "setting.subject_upload_limits", {
    maxMb: parsed.data.maxMb,
    maxFiles: parsed.data.maxFiles,
  });
  revalidatePath("/sanctum/access");
}

/** Set how much of the organize proposal auto-applies (ROADMAP C1.3). */
export async function setOrganizeAutoApply(formData: FormData) {
  const session = await requireGoddess();
  const value = String(formData.get("value"));
  const allowed = ["review_all", "tags_only", "everything"] as const;
  if (!(allowed as readonly string[]).includes(value)) throw new Error("bad value");
  const { setSetting } = await import("@/lib/settings");
  await setSetting("organize_auto_apply", value as (typeof allowed)[number]);
  await logAudit(session.user.id, "setting.organize_auto_apply", { value });
  revalidatePath("/sanctum/access");
}
