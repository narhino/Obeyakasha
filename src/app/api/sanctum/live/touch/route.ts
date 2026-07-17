import type { NextRequest } from "next/server";
import { z } from "zod";
import { withGoddess } from "@/lib/api";
import { sendTouch } from "@/lib/listen/live";

const schema = z.object({
  userId: z.string().uuid(),
  text: z.string().trim().min(1).max(240),
});

/**
 * She reaches into a live session (R9.1). Writes a "touch" moment for that one
 * subject — no push, they are already listening. Goddess-only; audited in
 * `sendTouch`.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withGoddess(async (actorId) => {
    await sendTouch(actorId, parsed.data.userId, parsed.data.text);
    return { ok: true };
  });
}
