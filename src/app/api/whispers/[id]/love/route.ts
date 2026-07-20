import type { NextRequest } from "next/server";
import { withSubject } from "@/lib/api";
import { toggleLove } from "@/lib/feed/loves";

/** Toggle the viewer's love on a whisper (F3). Returns the new state + fresh
 *  aggregate count — never who loved (D7). No push to her: a badge only. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withSubject(async (userId) => toggleLove(userId, id));
}
