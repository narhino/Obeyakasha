"use server";

import { revalidatePath } from "next/cache";
import { requireGoddess } from "@/lib/auth-helpers";
import { getSetting, setSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { notifyGoddess } from "@/lib/push/broadcast";

/**
 * Toggle her cloak (F4). While cloaked she vanishes from every subject's "She is
 * here" band, yet still sees the room herself. Used from Today (a mirror toggle
 * lives in Access). Audited, like every Sanctum mutation.
 */
export async function toggleCloak() {
  const session = await requireGoddess();
  const current = await getSetting("goddess_cloak");
  const next = !current;
  await setSetting("goddess_cloak", next);
  await logAudit(session.user.id, "presence.cloak", { cloaked: next });
  revalidatePath("/sanctum");
  revalidatePath("/sanctum/access");
}

/**
 * Prove her own alerts actually arrive. Pushes to HER devices only — the same
 * path every real alert takes, so a success here means the whole chain (keys,
 * subscription, service worker) is live. Her pushes are never disguised;
 * Secret mode is a subject's privacy, not hers.
 */
export async function sendTestAlert() {
  await requireGoddess();
  await notifyGoddess(
    "Testing.",
    "You'll hear me. This is what an alert looks like.",
    "/sanctum",
  );
}
