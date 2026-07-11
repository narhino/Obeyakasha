import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { recordHeartbeat } from "@/lib/listen/record";

const schema = z.object({
  sessionId: z.string().uuid(),
  trackId: z.string().uuid(),
  positionS: z.number().min(0),
  secondsListened: z.number().min(0),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) => {
    await recordHeartbeat({ userId, ...parsed.data });
    return { ok: true };
  });
}
