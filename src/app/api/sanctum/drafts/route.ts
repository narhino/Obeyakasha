import type { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { withGoddess } from "@/lib/api";
import { db } from "@/lib/db";
import { threads } from "@/lib/db/schema";
import { threadMessages } from "@/lib/messages/ops";
import { draftReplies, replyDraftingConfigured } from "@/lib/llm/reply";
import { subjectDossier } from "@/lib/profile/dossier";

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

    // The WHOLE conversation and the whole file on him — a reply written from
    // the last two lines is a reply that could go to anyone.
    const [msgs, dossier] = await Promise.all([
      threadMessages(parsed.data.threadId),
      subjectDossier(thread.userId),
    ]);
    const { drafts, reason } = await draftReplies({
      thread: msgs.map((m) => ({ sender: m.sender, body: m.body })),
      dossier,
    });
    return { configured: true, drafts, reason };
  });
}
