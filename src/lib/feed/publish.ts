import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { polls } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { broadcast } from "@/lib/push/broadcast";
import { copy } from "@/copy/copy";

/**
 * Fire the push for a whisper going live. This is the ONE code path shared by
 * immediate publishing (the composer) and the scheduled-whisper worker tick
 * (R9.9a), so the two can never drift — the body-vs-poll-question fallback, the
 * title, the deep link, and the audience are chosen identically either way.
 */
export async function sendWhisperPush(opts: {
  body: string | null;
  pollId: string | null;
  audience: Audience;
  createdBy?: string;
  /** The whisper's id — anchors the push at the exact card in the feed (F5). */
  whisperId?: string;
}): Promise<void> {
  // Prefer the whisper text; fall back to the attached poll's question.
  let pushBody = opts.body ? opts.body.slice(0, 120) : undefined;
  if (!pushBody && opts.pollId) {
    const [pq] = await db
      .select({ question: polls.question })
      .from(polls)
      .where(eq(polls.id, opts.pollId))
      .limit(1);
    pushBody = pq?.question;
  }

  await broadcast({
    title: opts.pollId ? copy.whispers.askingPush : copy.whispers.whisperedPush,
    body: pushBody,
    // Land on the exact whisper card in the feed (its anchor), not just `/` (F5).
    deepLink: opts.whisperId ? `/#whisper-${opts.whisperId}` : "/",
    audience: opts.audience,
    kind: "manual",
    createdBy: opts.createdBy,
  });
}
