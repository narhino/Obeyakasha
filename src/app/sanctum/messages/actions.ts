"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { sendGoddessMessage } from "@/lib/messages/ops";

const schema = z.object({
  threadId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

/** Akasha sends a reply (always her final decision — never auto-sent). */
export async function replyToThread(formData: FormData) {
  const session = await requireGoddess();
  const parsed = schema.safeParse({
    threadId: formData.get("threadId"),
    body: formData.get("body"),
  });
  if (!parsed.success) throw new Error("Invalid reply");
  await sendGoddessMessage(parsed.data.threadId, parsed.data.body);
  await logAudit(session.user.id, "message.replied", {
    threadId: parsed.data.threadId,
  });
  revalidatePath(`/sanctum/messages/${parsed.data.threadId}`);
  revalidatePath("/sanctum/messages");
}

const unsendSchema = z.object({
  messageId: z.string().uuid(),
  threadId: z.string().uuid(),
});

/**
 * Unsend one of HER messages. It vanishes from the subject's thread as though
 * it was never spoken — her word is absolute, including the taking back of it.
 * Scoped to `sender = 'goddess'` in the delete itself, so a subject's message
 * can never be removed through this path (she moderates those elsewhere).
 */
export async function unsendMessage(formData: FormData) {
  const session = await requireGoddess();
  const parsed = unsendSchema.safeParse({
    messageId: formData.get("messageId"),
    threadId: formData.get("threadId"),
  });
  if (!parsed.success) throw new Error("Invalid message");

  const removed = await db
    .delete(messages)
    .where(
      and(
        eq(messages.id, parsed.data.messageId),
        eq(messages.sender, "goddess"),
      ),
    )
    .returning({ id: messages.id });

  await logAudit(session.user.id, "message.unsent", {
    messageId: parsed.data.messageId,
    threadId: parsed.data.threadId,
    removed: removed.length > 0,
  });
  revalidatePath(`/sanctum/messages/${parsed.data.threadId}`);
  revalidatePath("/sanctum/messages");
}
