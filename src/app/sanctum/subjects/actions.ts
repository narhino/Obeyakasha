"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { broadcast } from "@/lib/push/broadcast";
import { acceptOath, declineOath } from "@/lib/oath/ops";
import { fill, copy } from "@/copy/copy";

const renameSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(80),
});

/** Rename a subject — an ownership ritual (A2). Notifies them in her voice. */
export async function renameSubject(formData: FormData) {
  const session = await requireGoddess();
  const parsed = renameSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
  });
  if (!parsed.success) throw new Error("Invalid rename");
  const { userId, name } = parsed.data;

  const [before] = await db
    .select({ old: users.chosenName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await db
    .update(users)
    .set({ chosenName: name, renamedByGoddess: true, updatedAt: new Date() })
    .where(eq(users.id, userId));

  await logAudit(session.user.id, "subject.renamed", {
    userId,
    from: before?.old,
    to: name,
  });

  await broadcast({
    title: fill(copy.rename.title, { name }),
    body: copy.rename.body,
    deepLink: "/me",
    audience: { type: "users", userIds: [userId] },
    kind: "system",
    createdBy: session.user.id,
    respectQuietHours: false,
  });

  revalidatePath("/sanctum/subjects");
}

/** One-tap personal "I see you" push from a profile (A1). */
export async function personalPush(formData: FormData) {
  const session = await requireGoddess();
  const userId = String(formData.get("userId"));
  const message = String(formData.get("message") ?? "").trim();
  if (!userId || !message) throw new Error("Missing");
  await broadcast({
    title: message,
    deepLink: "/library",
    audience: { type: "users", userIds: [userId] },
    kind: "manual",
    createdBy: session.user.id,
    respectQuietHours: false,
  });
  await logAudit(session.user.id, "subject.personal_push", { userId });
  revalidatePath("/sanctum/subjects");
}

const oathSchema = z.object({ userId: z.string().uuid() });

/** Accept a collar petition (R9.5): sets oathAt, rituals + pushes, audited. */
export async function acceptOathAction(formData: FormData) {
  const session = await requireGoddess();
  const parsed = oathSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) throw new Error("Invalid subject");
  await acceptOath(parsed.data.userId, session.user.id);
  revalidatePath(`/sanctum/subjects/${parsed.data.userId}`);
  revalidatePath("/sanctum");
}

/** Decline a collar petition (R9.5): clears it quietly — her silence is the answer. */
export async function declineOathAction(formData: FormData) {
  const session = await requireGoddess();
  const parsed = oathSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) throw new Error("Invalid subject");
  await declineOath(parsed.data.userId, session.user.id);
  revalidatePath(`/sanctum/subjects/${parsed.data.userId}`);
  revalidatePath("/sanctum");
}

const gateSchema = z.object({
  userId: z.string().uuid(),
  which: z.enum(["phone", "desktop"]),
});

/**
 * Release one subject from the notification requirement, or put them back under
 * it — separately for their phone and their laptop.
 *
 * This does NOT stop sending them notifications. It decides whether the app
 * *demands* them:
 *   phone off   → never held at the threshold on a phone. No install demand, no
 *                 notification demand, no re-proof. They can still turn
 *                 notifications on themselves whenever they like.
 *   desktop off → never even asked on a laptop. (A laptop is never a wall for
 *                 anyone; this only silences the invitation.)
 *
 * For the subject whose phone will not carry it, or whom she has simply decided
 * not to press.
 */
export async function toggleSubjectGate(formData: FormData) {
  const session = await requireGoddess();
  const parsed = gateSchema.safeParse({
    userId: formData.get("userId"),
    which: formData.get("which"),
  });
  if (!parsed.success) throw new Error("Invalid gate toggle");
  const { userId, which } = parsed.data;

  const column = which === "phone" ? users.gatePhone : users.gateDesktop;
  const [row] = await db
    .update(users)
    .set(
      which === "phone"
        ? { gatePhone: sql`not ${column}`, updatedAt: new Date() }
        : { gateDesktop: sql`not ${column}`, updatedAt: new Date() },
    )
    .where(eq(users.id, userId))
    .returning({ phone: users.gatePhone, desktop: users.gateDesktop });

  await logAudit(session.user.id, "subject.gate_changed", {
    userId,
    which,
    required: which === "phone" ? row?.phone : row?.desktop,
  });
  revalidatePath(`/sanctum/subjects/${userId}`);
}
