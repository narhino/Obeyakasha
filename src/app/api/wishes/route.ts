import type { NextRequest } from "next/server";
import { and, eq, gt } from "drizzle-orm";
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
    // Dedup (G04): an identical petition inside a minute is a double-submit,
    // not a second wish — absorb it silently.
    const [dupe] = await db
      .select({ id: wishes.id })
      .from(wishes)
      .where(
        and(
          eq(wishes.userId, userId),
          eq(wishes.body, parsed.data.body),
          gt(wishes.createdAt, new Date(Date.now() - 60_000)),
        ),
      )
      .limit(1);
    if (dupe) return { ok: true, deduped: true };

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
