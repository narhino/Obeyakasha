import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { getOrCreateThread, sendGoddessMessage } from "./ops";

/**
 * Auto-welcome (R9.9b). The first time a brand-new subject connects, drop her
 * welcome into their thread as a real message — `sendGoddessMessage` already
 * pushes "She spoke to you." and trains the voice corpus. Fires ONCE per subject
 * ever (guarded on an empty thread), never for the goddess, and only while the
 * `welcome_dm_enabled` dial is on with non-empty `welcome_dm_text`.
 *
 * NEVER throws — a welcome is a grace note; it must never block a sign-in.
 */
export async function maybeSendWelcomeDm(
  userId: string,
  isGoddess: boolean,
): Promise<void> {
  try {
    if (isGoddess) return;
    if (!(await getSetting("welcome_dm_enabled"))) return;

    const threadId = await getOrCreateThread(userId);
    // Once-ever guard: send only when this subject has no messages at all yet.
    const [existing] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.threadId, threadId))
      .limit(1);
    if (existing) return;

    const text = (await getSetting("welcome_dm_text")).trim();
    if (!text) return;

    await sendGoddessMessage(threadId, text);
    await logAudit(userId, "welcome_dm.sent", {});
  } catch (err) {
    console.error("[welcome] maybeSendWelcomeDm failed:", err);
  }
}
