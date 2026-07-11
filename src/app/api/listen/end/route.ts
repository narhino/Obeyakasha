import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { recordEnd } from "@/lib/listen/record";

const schema = z.object({
  sessionId: z.string().uuid(),
  trackId: z.string().uuid(),
  positionS: z.number().min(0),
  endReason: z.enum(["finished", "stopped", "grounded", "abandoned"]),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) => {
    return recordEnd({ userId, ...parsed.data });
  });
}
