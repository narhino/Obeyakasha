import type { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withGoddess } from "@/lib/api";
import { db } from "@/lib/db";
import { threads } from "@/lib/db/schema";
import { threadMessages } from "@/lib/messages/ops";
import { draftReplies, replyDraftingConfigured } from "@/lib/llm/reply";
import { profileSummary } from "@/lib/profile/summary";

const schema = z.object({ threadId: z.string().uuid() });

/** Propose 3 AI reply drafts (F11). Never sends. Goddess-only. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withGoddess(async () => {
    if (!replyDraftingConfigured()) {
      return { configured: false, drafts: null };
    }
    const [thread] = await db
      .select({ userId: threads.userId })
      .from(threads)
      .where(eq(threads.id, parsed.data.threadId))
      .limit(1);
    if (!thread) return { configured: true, drafts: null };

    const msgs = await threadMessages(parsed.data.threadId);
    const summary = await profileSummary(thread.userId);
    const drafts = await draftReplies({
      thread: msgs.map((m) => ({ sender: m.sender, body: m.body })),
      profileSummary: summary,
    });
    return { configured: true, drafts };
  });
}
