import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

/**
 * Append an audit record. EVERY Sanctum mutation calls this (PLAN §6.5/§20).
 * actorUserId is null for system/automation actions.
 */
export async function logAudit(
  actorUserId: string | null,
  action: string,
  subject?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: actorUserId ?? undefined,
    action,
    subject: subject ?? undefined,
  });
}
