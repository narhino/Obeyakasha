"use server";

import { revalidatePath } from "next/cache";
import { requireGoddess } from "@/lib/auth-helpers";
import { getSetting, setSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

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
