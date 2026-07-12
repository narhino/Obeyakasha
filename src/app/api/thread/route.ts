import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { myThread, sendSubjectMessage } from "@/lib/messages/ops";

/** Subject's own thread with Akasha. */
export async function GET() {
  return withSubject(async (userId) => {
    const { messages } = await myThread(userId);
    return {
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        createdAt: m.createdAt,
      })),
    };
  });
}

const sendSchema = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) => {
    const result = await sendSubjectMessage(userId, parsed.data.body);
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true };
  });
}
