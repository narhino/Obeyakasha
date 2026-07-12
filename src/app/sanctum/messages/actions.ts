"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
