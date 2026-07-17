"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { broadcast } from "@/lib/push/broadcast";
import type { Audience } from "@/lib/db/schema/relationship";

const schema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(300).optional(),
  deepLink: z.string().max(300).optional(),
  audienceType: z.enum(["all", "level", "oath", "user"]),
  level: z.coerce.number().int().min(0).max(99).optional(),
  userId: z.string().uuid().optional(),
  respectQuietHours: z.union([z.literal("on"), z.null()]).optional(),
});

export async function sendBroadcast(formData: FormData) {
  const session = await requireGoddess();
  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body") || undefined,
    deepLink: formData.get("deepLink") || undefined,
    audienceType: formData.get("audienceType"),
    level: formData.get("level") || undefined,
    userId: formData.get("userId") || undefined,
    respectQuietHours: formData.get("respectQuietHours"),
  });
  if (!parsed.success) throw new Error("Invalid broadcast");
  const d = parsed.data;

  let audience: Audience;
  if (d.audienceType === "all") audience = { type: "all" };
  else if (d.audienceType === "level")
    audience = { type: "level", level: d.level ?? 1 };
  else if (d.audienceType === "oath") audience = { type: "oath" };
  else {
    if (!d.userId) throw new Error("Pick a subject");
    audience = { type: "users", userIds: [d.userId] };
  }

  const stats = await broadcast({
    title: d.title,
    body: d.body,
    deepLink: d.deepLink || "/library",
    audience,
    kind: "manual",
    createdBy: session.user.id,
    respectQuietHours: d.respectQuietHours === "on",
  });

  await logAudit(session.user.id, "broadcast.sent", {
    notificationId: stats.notificationId,
    recipients: stats.recipients,
    sent: stats.sent,
  });
  revalidatePath("/sanctum/broadcast");
}
