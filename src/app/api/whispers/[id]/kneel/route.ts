import type { NextRequest } from "next/server";
import { withSubject } from "@/lib/api";
import { kneel } from "@/lib/feed/whispers";

/** Kneel for a whisper (the only reaction, A11). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withSubject(async (userId) => {
    await kneel(userId, id);
    return { ok: true };
  });
}
