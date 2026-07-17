import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { wishes } from "@/lib/db/schema";
import { notifyGoddess } from "@/lib/push/broadcast";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  title: z.string().max(80).optional(),
  body: z.string().min(1).max(1000),
});

/** Subject petitions her — drops a titled wish into the wishbox (A15 / R6 Ask). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const title = parsed.data.title?.trim() || null;
  return withSubject(async (userId) => {
    const [wish] = await db
      .insert(wishes)
      .values({
        userId,
        title,
        body: parsed.data.body,
        source: "wishbox",
        status: "new",
      })
      .returning({ id: wishes.id });
    // Admin-facing notice (Sanctum strings stay inline English by convention).
    await notifyGoddess(
      "A petition arrived.",
      title ?? "Someone asks something of you.",
      "/sanctum/wishes",
    );
    await logAudit(userId, "wish.create", { wishId: wish?.id, source: "wishbox" });
    return { ok: true };
  });
}
