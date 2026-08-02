"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlements, users } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { broadcast } from "@/lib/push/broadcast";
import { acceptOath, declineOath } from "@/lib/oath/ops";
import { reconcileOne } from "@/lib/patreon/reconcile";
import { addNote, deleteNote, toggleNotePinned } from "@/lib/profile/dossier";
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

const accessSchema = z.object({
  userId: z.string().uuid(),
  level: z.coerce.number().int().min(0).max(99),
  reason: z.string().max(200).optional(),
});

/**
 * Set a subject's access by hand — her own grant, independent of Patreon.
 *
 * Entitlements stack as `max(patreon, grants)`, so this can only ever OPEN
 * something, never take away what a live pledge already gives. That is
 * deliberate: a hand-set level must not become a way to accidentally lock out a
 * paying member, and it must not silently fight the next Patreon sync.
 *
 * Level 0 clears her grant and hands them back to whatever Patreon says.
 *
 * This exists so a member whose pledge the API is wrong about — or who paid
 * outside Patreon entirely — can be opened up in one click, right now, rather
 * than waiting on a sweep.
 */
export async function setSubjectAccess(formData: FormData) {
  const session = await requireGoddess();
  const parsed = accessSchema.safeParse({
    userId: formData.get("userId"),
    level: formData.get("level"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid access change");
  const { userId, level, reason } = parsed.data;

  const existing = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(eq(entitlements.userId, userId), eq(entitlements.source, "grant")),
    )
    .limit(1);

  if (level === 0) {
    // Not a "level 0 grant" — remove the grant entirely, so the row can never
    // sit there looking like an active decision that does nothing.
    if (existing.length > 0) {
      await db.delete(entitlements).where(eq(entitlements.id, existing[0]!.id));
    }
  } else if (existing.length > 0) {
    await db
      .update(entitlements)
      .set({
        accessLevel: level,
        status: "active",
        reason: reason ?? "set by hand in the Sanctum",
        updatedAt: new Date(),
      })
      .where(eq(entitlements.id, existing[0]!.id));
  } else {
    await db.insert(entitlements).values({
      userId,
      accessLevel: level,
      source: "grant",
      status: "active",
      reason: reason ?? "set by hand in the Sanctum",
    });
  }

  await logAudit(session.user.id, "subject.access_set", { userId, level, reason });
  revalidatePath(`/sanctum/subjects/${userId}`);
}

/**
 * Ask Patreon about this one subject right now. The button beside her manual
 * control, for the common case: they say they've re-pledged and she wants to
 * confirm it rather than override it.
 */
export async function recheckSubjectPatreon(formData: FormData) {
  const session = await requireGoddess();
  const userId = String(formData.get("userId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Invalid subject");
  const active = await reconcileOne(userId);
  await logAudit(session.user.id, "subject.patreon_rechecked", { userId, active });
  revalidatePath(`/sanctum/subjects/${userId}`);
}

// ── Her file on a person (F1) ──────────────────────────────────────────────

const noteSchema = z.object({
  userId: z.string().uuid(),
  body: z.string().min(1).max(2000),
  pinned: z.string().optional(),
});

/**
 * Write something down about someone. This is the one place in the app that
 * holds what she knows and the counters can't: what he responds to, what he is
 * afraid of, what made him give. Every proposed reply reads it first, held
 * notes at the top — so a line written here changes every answer after it.
 *
 * Hers alone. Never shown to the subject, and deliberately not in their export.
 */
export async function addSubjectNote(formData: FormData) {
  const session = await requireGoddess();
  const parsed = noteSchema.safeParse({
    userId: formData.get("userId"),
    body: formData.get("body"),
    pinned: formData.get("pinned") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid note");
  await addNote(parsed.data.userId, parsed.data.body, parsed.data.pinned === "true");
  await logAudit(session.user.id, "subject.note_added", {
    userId: parsed.data.userId,
    length: parsed.data.body.length,
  });
  revalidatePath(`/sanctum/subjects/${parsed.data.userId}`);
}

export async function deleteSubjectNote(formData: FormData) {
  const session = await requireGoddess();
  const noteId = z.string().uuid().parse(formData.get("noteId"));
  const userId = await deleteNote(noteId);
  if (!userId) return;
  await logAudit(session.user.id, "subject.note_deleted", { userId, noteId });
  revalidatePath(`/sanctum/subjects/${userId}`);
}

/** Hold a note at the top of the file — and at the top of what the drafter reads. */
export async function pinSubjectNote(formData: FormData) {
  const session = await requireGoddess();
  const noteId = z.string().uuid().parse(formData.get("noteId"));
  const userId = await toggleNotePinned(noteId);
  if (!userId) return;
  await logAudit(session.user.id, "subject.note_pinned", { userId, noteId });
  revalidatePath(`/sanctum/subjects/${userId}`);
}
