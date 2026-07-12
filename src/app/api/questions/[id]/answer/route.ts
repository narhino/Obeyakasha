import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { answerQuestion } from "@/lib/questions/ops";

const schema = z.object({ answer: z.string().min(1).max(2000) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) => {
    await answerQuestion(userId, id, parsed.data.answer);
    return { ok: true };
  });
}
