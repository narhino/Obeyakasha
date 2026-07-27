"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { automations, devices } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { setRawSetting } from "@/lib/settings";
import { triggerSpec } from "@/lib/automations/triggers";

const TRIGGERS = [
  "inactive_days",
  "chain_broken",
  "anniversary",
  "lapse",
] as const;

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  trigger: z.enum(TRIGGERS),
  label: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  body: z.string().max(300).optional(),
  deepLink: z.string().max(200).optional(),
  days: z.coerce.number().int().min(2).max(60).optional(),
  audienceType: z.enum(["all", "level", "oath"]),
  level: z.coerce.number().int().min(0).max(99).optional(),
  respectQuietHours: z.enum(["true", "false"]),
  enabled: z.enum(["true", "false"]),
});

export type AutomationFormState = { ok?: boolean; error?: string };

/** Create or edit one automation. Everything about it except the trigger. */
export async function saveAutomation(
  _prev: AutomationFormState,
  formData: FormData,
): Promise<AutomationFormState> {
  const session = await requireGoddess();
  const parsed = saveSchema.safeParse({
    id: formData.get("id") || undefined,
    trigger: formData.get("trigger"),
    label: formData.get("label"),
    title: formData.get("title"),
    body: formData.get("body") || undefined,
    deepLink: formData.get("deepLink") || undefined,
    days: formData.get("days") || undefined,
    audienceType: formData.get("audienceType") || "all",
    level: formData.get("level") || undefined,
    respectQuietHours: formData.get("respectQuietHours") || "true",
    enabled: formData.get("enabled") || "false",
  });
  if (!parsed.success) {
    return { error: "That didn't hold together. Check the words and the trigger." };
  }
  const d = parsed.data;
  const spec = triggerSpec(d.trigger);
  if (!spec) return { error: "That trigger doesn't exist." };

  const audience: Audience =
    d.audienceType === "level"
      ? { type: "level", level: d.level ?? 1 }
      : d.audienceType === "oath"
        ? { type: "oath" }
        : { type: "all" };

  // Only keep params the trigger actually reads — a stray `days` on a trigger
  // with no window would sit in the row implying it does something.
  const params: Record<string, number> = {};
  if (spec.param?.key === "days" && d.days !== undefined) params.days = d.days;

  const values = {
    trigger: d.trigger,
    label: d.label.trim(),
    title: d.title.trim(),
    body: d.body?.trim() || null,
    deepLink: d.deepLink?.trim() || spec.defaultLink,
    params,
    audience,
    respectQuietHours: d.respectQuietHours === "true",
    enabled: d.enabled === "true",
    updatedAt: new Date(),
  };

  if (d.id) {
    await db.update(automations).set(values).where(eq(automations.id, d.id));
    await logAudit(session.user.id, "automation.updated", {
      id: d.id,
      trigger: d.trigger,
      enabled: values.enabled,
    });
  } else {
    const [created] = await db
      .insert(automations)
      .values(values)
      .returning({ id: automations.id });
    await logAudit(session.user.id, "automation.created", {
      id: created?.id,
      trigger: d.trigger,
      enabled: values.enabled,
    });
  }
  revalidatePath("/sanctum/notifications");
  return { ok: true };
}

const idSchema = z.object({ id: z.string().uuid() });

/** Flip one automation on or off without opening it. */
export async function toggleAutomation(formData: FormData) {
  const session = await requireGoddess();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) throw new Error("Invalid automation");
  const [row] = await db
    .update(automations)
    .set({ enabled: sql`not ${automations.enabled}`, updatedAt: new Date() })
    .where(eq(automations.id, parsed.data.id))
    .returning({ enabled: automations.enabled });
  await logAudit(session.user.id, "automation.toggled", {
    id: parsed.data.id,
    enabled: row?.enabled,
  });
  revalidatePath("/sanctum/notifications");
}

export async function deleteAutomation(formData: FormData) {
  const session = await requireGoddess();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) throw new Error("Invalid automation");
  await db.delete(automations).where(eq(automations.id, parsed.data.id));
  await logAudit(session.user.id, "automation.deleted", { id: parsed.data.id });
  revalidatePath("/sanctum/notifications");
}

/**
 * Demand fresh proof from every device.
 *
 * Stamps "now" on the re-verify line: every device whose last PROVED delivery
 * predates this moment is held at the threshold on their next visit until one
 * real notification is seen landing. This is the recovery lever for the silent
 * outage — a device that says "allowed" but receives nothing has no way to
 * discover that on its own, and neither did she.
 *
 * It does NOT touch subscriptions. Anyone whose line genuinely works proves it
 * in about two seconds and never notices; only the broken ones are stopped.
 */
export async function demandReverification() {
  const session = await requireGoddess();
  const now = new Date();
  await setRawSetting("push_reverify_since", now.toISOString());
  const [counts] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(devices);
  await logAudit(session.user.id, "push.reverify_demanded", {
    at: now.toISOString(),
    devices: counts?.n ?? 0,
  });
  revalidatePath("/sanctum/notifications");
}

/** Lift the demand — everyone who was still owing proof is let through. */
export async function clearReverification() {
  const session = await requireGoddess();
  await setRawSetting("push_reverify_since", "");
  await logAudit(session.user.id, "push.reverify_cleared", {});
  revalidatePath("/sanctum/notifications");
}
