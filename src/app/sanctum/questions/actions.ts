"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { questions } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { broadcast } from "@/lib/push/broadcast";

const schema = z.object({
  prompt: z.string().min(1).max(300),
  audienceType: z.enum(["all", "level"]),
  level: z.coerce.number().int().min(0).max(99).optional(),
});

export async function createQuestion(formData: FormData) {
  const session = await requireGoddess();
  const parsed = schema.safeParse({
    prompt: formData.get("prompt"),
    audienceType: formData.get("audienceType"),
    level: formData.get("level") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid question");
  const d = parsed.data;
  const audience: Audience =
    d.audienceType === "all"
      ? { type: "all" }
      : { type: "level", level: d.level ?? 1 };

  await db.insert(questions).values({
    prompt: d.prompt,
    kind: "ritual",
    audience,
  });
  await broadcast({
    title: "Answer me.",
    body: d.prompt,
    deepLink: "/asks",
    audience,
    kind: "manual",
    createdBy: session.user.id,
  });
  await logAudit(session.user.id, "question.created", { prompt: d.prompt });
  revalidatePath("/sanctum/questions");
}
