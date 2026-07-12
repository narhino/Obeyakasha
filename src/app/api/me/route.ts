import type { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { consents, users } from "@/lib/db/schema";

const schema = z.object({
  timezone: z.string().max(60).optional(),
  quietHoursStart: z.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.number().int().min(0).max(23).optional(),
  themeOptouts: z.array(z.string().max(60)).max(50).optional(),
});

/** Update subject settings: timezone, quiet hours, theme opt-outs (A21). */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const d = parsed.data;
  return withSubject(async (userId) => {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (d.timezone) set.timezone = d.timezone;
    if (d.quietHoursStart != null) set.quietHoursStart = d.quietHoursStart;
    if (d.quietHoursEnd != null) set.quietHoursEnd = d.quietHoursEnd;
    await db.update(users).set(set).where(eq(users.id, userId));

    if (d.themeOptouts) {
      await db.insert(consents).values({
        userId,
        kind: "theme_optout",
        payload: { themes: d.themeOptouts },
      });
    }
    return { ok: true };
  });
}
