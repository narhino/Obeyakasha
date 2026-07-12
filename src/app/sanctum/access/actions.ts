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
  ] as const;
  if (!(allowed as readonly string[]).includes(key)) throw new Error("bad key");
  const { getSetting, setSetting } = await import("@/lib/settings");
  const k = key as (typeof allowed)[number];
  const current = await getSetting(k);
  await setSetting(k, !current);
  await logAudit(session.user.id, "setting.toggled", { key, value: !current });
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
