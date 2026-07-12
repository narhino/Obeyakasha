import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { wishes } from "@/lib/db/schema";

const schema = z.object({ body: z.string().min(1).max(1000) });

/** Subject drops a wish (A15). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) => {
    await db
      .insert(wishes)
      .values({ userId, body: parsed.data.body, source: "wishbox" });
    return { ok: true };
  });
}
