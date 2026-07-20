import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { createComment } from "@/lib/feed/comments";

const schema = z.object({ body: z.string().min(1).max(500) });

/**
 * A subject speaks privately under a whisper (F3). Auth + subject role via
 * withSubject; body validated 1–500. Her cap / dedup live in createComment. No
 * push to her — a fail-soft nav badge only (never spam). The comment is visible
 * only to its author and the goddess (D7): this returns the caller's own row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) =>
    createComment(userId, id, parsed.data.body),
  );
}
