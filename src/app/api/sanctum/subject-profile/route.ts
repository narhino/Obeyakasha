import type { NextRequest } from "next/server";
import { z } from "zod";
import { withGoddess } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { buildProfile, portraitConfigured } from "@/lib/llm/portrait";

const schema = z.object({ userId: z.string().uuid() });

/**
 * Re-read one subject and rewrite her file on him (F1). Goddess-only.
 *
 * Deliberately a button rather than something that runs on its own: reading a
 * person costs a real model call, and she is the one who knows when there's
 * something new worth reading.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withGoddess(async (goddessId) => {
    if (!portraitConfigured()) return { configured: false, profile: null };
    const { profile, reason } = await buildProfile(parsed.data.userId);
    if (profile) {
      await logAudit(goddessId, "subject.profile_read", {
        userId: parsed.data.userId,
        messagesSeen: profile.messagesSeen,
      });
    }
    return { configured: true, profile, reason };
  });
}
