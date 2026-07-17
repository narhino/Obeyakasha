import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { moments, users } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { broadcast, notifyGoddess } from "@/lib/push/broadcast";
import { copy } from "@/copy/copy";
import { oathStatusFor } from "./resolve";

/**
 * A subject petitions for the collar (R9.5). Server-side eligibility is
 * re-checked (never trust the client): only an `eligible` subject may stamp
 * oathPetitionedAt, and the update is claimed WHERE it's still null so a replay
 * or double-tap can never re-notify her. On success she is pushed and it's
 * audited. Returns whether the petition was newly recorded.
 */
export async function petitionOath(userId: string): Promise<{ petitioned: boolean }> {
  // Re-derive the state server-side; only `eligible` may proceed (canPetition).
  const status = await oathStatusFor(userId);
  if (status.state !== "eligible") {
    // Not eligible, already petitioned, or already collared — no-op, no notify.
    return { petitioned: false };
  }

  const claimed = await db
    .update(users)
    .set({ oathPetitionedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.oathPetitionedAt), isNull(users.oathAt)))
    .returning({ id: users.id, name: users.chosenName });
  if (claimed.length === 0) return { petitioned: false };

  const name = claimed[0]?.name ?? "one of yours";
  await notifyGoddess(
    "A petition for your collar.",
    `${name} kneels and asks to be collared.`,
    `/sanctum/subjects/${userId}`,
  );
  await logAudit(userId, "oath.petitioned", { userId });
  return { petitioned: true };
}

/**
 * She accepts the petition (R9.5): the collar closes. Sets oathAt, clears the
 * petition, lays down the full-screen "collared" ritual moment for their next
 * session, and pushes her voice now (quiet hours yield — she has decided).
 * Claimed WHERE oathAt IS NULL so a double-accept only fires the ritual once.
 */
export async function acceptOath(userId: string, actorId: string): Promise<void> {
  const now = new Date();
  const claimed = await db
    .update(users)
    .set({ oathAt: now, oathPetitionedAt: null, updatedAt: now })
    .where(and(eq(users.id, userId), isNull(users.oathAt)))
    .returning({ id: users.id });
  if (claimed.length === 0) return; // already collared — nothing to re-fire

  await db.insert(moments).values({ userId, kind: "collared", payload: {} });
  await broadcast({
    title: copy.oath.acceptPush.title,
    body: copy.oath.acceptPush.body,
    deepLink: "/me",
    audience: { type: "users", userIds: [userId] },
    kind: "system",
    createdBy: actorId,
    respectQuietHours: false,
  });
  await logAudit(actorId, "oath.accepted", { userId });
}

/**
 * She declines — quietly (R9.5). The petition is cleared with no push: her
 * silence is the answer. Audited so the act is on the record.
 */
export async function declineOath(userId: string, actorId: string): Promise<void> {
  await db
    .update(users)
    .set({ oathPetitionedAt: null, updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.oathAt)));
  await logAudit(actorId, "oath.declined", { userId });
}
