import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { recordDropReport } from "@/lib/listen/record";

const schema = z.object({
  sessionId: z.string().uuid(),
  trackId: z.string().uuid(),
  depth: z.number().int().min(1).max(5),
  note: z.string().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) => {
    await recordDropReport({
      userId,
      sessionId: parsed.data.sessionId,
      trackId: parsed.data.trackId,
      depth: parsed.data.depth,
      note: parsed.data.note ?? null,
    });
    return { ok: true };
  });
}
