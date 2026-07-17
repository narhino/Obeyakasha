"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { issueOrder, praiseProof } from "@/lib/orders/ops";
import type { Audience } from "@/lib/db/schema/relationship";

const schema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  requires: z.enum(["ack", "text", "none"]),
  proofMode: z.enum(["none", "optional", "required"]),
  audienceType: z.enum(["all", "level"]),
  level: z.coerce.number().int().min(0).max(99).optional(),
  dueAt: z.string().optional(),
});

export async function createOrder(formData: FormData) {
  const session = await requireGoddess();
  const parsed = schema.safeParse({
    title: formData.get("title"),
    body: formData.get("body") || undefined,
    requires: formData.get("requires"),
    proofMode: formData.get("proofMode"),
    audienceType: formData.get("audienceType"),
    level: formData.get("level") || undefined,
    dueAt: formData.get("dueAt") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid order");
  const d = parsed.data;
  const audience: Audience =
    d.audienceType === "all"
      ? { type: "all" }
      : { type: "level", level: d.level ?? 1 };

  // datetime-local has no zone; treat the string as the server's local wall time.
  const parsedDue = d.dueAt ? new Date(d.dueAt) : null;
  const dueAt =
    parsedDue && !Number.isNaN(parsedDue.getTime()) ? parsedDue : null;

  await issueOrder({
    title: d.title,
    body: d.body,
    requires: d.requires,
    proofMode: d.proofMode,
    audience,
    dueAt,
    createdBy: session.user.id,
  });
  await logAudit(session.user.id, "order.issued", {
    title: d.title,
    proofMode: d.proofMode,
  });
  revalidatePath("/sanctum/orders");
}

const praiseSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function praiseProofAction(formData: FormData) {
  const session = await requireGoddess();
  const parsed = praiseSchema.safeParse({
    orderId: formData.get("orderId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) throw new Error("Invalid praise");
  await praiseProof(parsed.data.userId, parsed.data.orderId, session.user.id);
  await logAudit(session.user.id, "order.proof_praised", parsed.data);
  revalidatePath("/sanctum/orders");
}
