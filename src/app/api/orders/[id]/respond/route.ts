import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { respondToOrder } from "@/lib/orders/ops";

const schema = z.object({ response: z.string().max(2000).nullable().optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  const response = parsed.success ? (parsed.data.response ?? null) : null;
  return withSubject(async (userId) => {
    await respondToOrder(userId, id, response);
    return { ok: true };
  });
}
