"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { issueOrder } from "@/lib/orders/ops";
import type { Audience } from "@/lib/db/schema/relationship";

const schema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  requires: z.enum(["ack", "text", "none"]),
  audienceType: z.enum(["all", "level"]),
  level: z.coerce.number().int().min(0).max(99).optional(),
});

export async function createOrder(formData: FormData) {
  const session = await requireGoddess();
  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body") || undefined,
    requires: formData.get("requires"),
    audienceType: formData.get("audienceType"),
    level: formData.get("level") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid order");
  const d = parsed.data;
  const audience: Audience =
    d.audienceType === "all"
      ? { type: "all" }
      : { type: "level", level: d.level ?? 1 };

  await issueOrder({
    title: d.title,
    body: d.body,
    requires: d.requires,
    audience,
    createdBy: session.user.id,
  });
  await logAudit(session.user.id, "order.issued", { title: d.title });
  revalidatePath("/sanctum/orders");
}
