import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { consents } from "@/lib/db/schema";

const schema = z.object({
  kind: z.enum(["age", "hypnosis_terms", "privacy", "theme_optout"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

/** Record a consent (append-only, PLAN §11 / A19). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) => {
    await db.insert(consents).values({
      userId,
      kind: parsed.data.kind,
      payload: parsed.data.payload ?? {},
    });
    return { ok: true };
  });
}
