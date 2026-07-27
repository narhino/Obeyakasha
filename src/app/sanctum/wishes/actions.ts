"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wishes } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { getOrCreateThread, sendGoddessMessage } from "@/lib/messages/ops";
import { broadcast } from "@/lib/push/broadcast";
import { copy } from "@/copy/copy";

export async function setWishStatus(formData: FormData) {
  const session = await requireGoddess();
  const id = String(formData.get("wishId"));
  const status = String(formData.get("status")) as
    | "new"
    | "clustered"
    | "planned"
    | "shipped"
    | "declined";
  await db.update(wishes).set({ status }).where(eq(wishes.id, id));
  await logAudit(session.user.id, "wish.status", { id, status });
  revalidatePath("/sanctum/wishes");
}

const replySchema = z.object({
  wishId: z.string().uuid(),
  reply: z.string().min(1).max(1000),
});

/**
 * She answers a petition (R6). Sets reply + repliedAt (status stays her call
 * via the existing control), audits it, and pushes the answer to that one
 * subject in her voice ("She answered your petition."). Deep-links to their You
 * page, where the reply shows beneath the ask.
 */
export async function replyToWish(formData: FormData) {
  const session = await requireGoddess();
  const parsed = replySchema.safeParse({
    wishId: String(formData.get("wishId")),
    reply: String(formData.get("reply") ?? "").trim(),
  });
  if (!parsed.success) return;

  const [wish] = await db
    .update(wishes)
    .set({ reply: parsed.data.reply, repliedAt: new Date() })
    .where(eq(wishes.id, parsed.data.wishId))
    .returning({
      userId: wishes.userId,
      title: wishes.title,
      body: wishes.body,
    });

  await logAudit(session.user.id, "wish.reply", { id: parsed.data.wishId });

  if (wish) {
    // An answer used to be a dead end: stored on the ask, a push to /me, and
    // no way for either of them to say the next thing. Now it becomes a real
    // conversation — the ask is quoted into their thread so the answer has its
    // context, and everything after it continues in Messages like any other.
    const threadId = await getOrCreateThread(wish.userId);
    await sendGoddessMessage(
      threadId,
      parsed.data.reply,
      `${copy.ask.threadBanner} “${wish.title}”`,
    );
    await broadcast({
      title: copy.ask.answeredPushTitle,
      body: copy.ask.answeredPushBody,
      deepLink: "/messages",
      audience: { type: "users", userIds: [wish.userId] },
    });
  }
  revalidatePath("/sanctum/wishes");
  revalidatePath("/sanctum/messages");
}
