"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { whispers } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { broadcast } from "@/lib/push/broadcast";

const schema = z.object({
  body: z.string().min(1).max(500),
  audienceType: z.enum(["all", "level", "user"]),
  level: z.coerce.number().int().min(0).max(99).optional(),
  userId: z.string().uuid().optional(),
});

/** Post a whisper (A11) → feed + push. */
export async function publishWhisper(formData: FormData) {
  const session = await requireGoddess();
  const parsed = schema.safeParse({
    body: formData.get("body"),
    audienceType: formData.get("audienceType"),
    level: formData.get("level") || undefined,
    userId: formData.get("userId") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid whisper");
  const d = parsed.data;

  let audience: Audience;
  if (d.audienceType === "all") audience = { type: "all" };
  else if (d.audienceType === "level")
    audience = { type: "level", level: d.level ?? 1 };
  else {
    if (!d.userId) throw new Error("Pick a subject");
    audience = { type: "users", userIds: [d.userId] };
  }

  await db.insert(whispers).values({
    body: d.body,
    audience,
    publishedAt: new Date(),
  });

  await broadcast({
    title: "She whispered.",
    body: d.body.slice(0, 120),
    deepLink: "/whispers",
    audience,
    kind: "manual",
    createdBy: session.user.id,
  });

  await logAudit(session.user.id, "whisper.published", {
    audience: d.audienceType,
  });
  revalidatePath("/sanctum/whispers");
}
