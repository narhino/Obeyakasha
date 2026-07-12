import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { commissions, grants } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { broadcast, notifyGoddess } from "@/lib/push/broadcast";
import { copy } from "@/copy/copy";

export type CommissionStatus =
  | "new"
  | "reviewing"
  | "accepted"
  | "in_progress"
  | "delivered"
  | "declined"
  | "closed";

/** Subject submits a commission request (or joins the waitlist if closed). */
export async function submitCommission(
  userId: string,
  answers: Record<string, unknown>,
): Promise<{ waitlisted: boolean }> {
  const open = await getSetting("commissions_open");
  await db.insert(commissions).values({
    userId,
    answers,
    waitlist: !open,
    status: "new",
  });
  await notifyGoddess(
    open ? "A new commission." : "Someone petitioned the waitlist.",
    "",
    "/sanctum/commissions",
  );
  return { waitlisted: !open };
}

export async function setCommissionStatus(
  commissionId: string,
  status: CommissionStatus,
): Promise<void> {
  await db
    .update(commissions)
    .set({ status, updatedAt: new Date() })
    .where(eq(commissions.id, commissionId));
}

/** Deliver a finished track privately to the commissioner (D2/§14.1). */
export async function deliverCommission(
  commissionId: string,
  trackId: string,
  grantedBy: string,
): Promise<void> {
  const [c] = await db
    .select()
    .from(commissions)
    .where(eq(commissions.id, commissionId))
    .limit(1);
  if (!c) throw new Error("No commission");

  await db.insert(grants).values({
    userId: c.userId,
    trackId,
    grantedBy,
    note: `commission ${commissionId}`,
  });
  await db
    .update(commissions)
    .set({ status: "delivered", deliveredTrackId: trackId, updatedAt: new Date() })
    .where(eq(commissions.id, commissionId));

  await broadcast({
    title: copy.comm.delivered,
    deepLink: "/library",
    audience: { type: "users", userIds: [c.userId] },
    kind: "manual",
    createdBy: grantedBy,
    respectQuietHours: false,
  });
}

/** When commissions reopen, notify waitlisted petitioners in order (A14). */
export async function notifyWaitlistReopened(createdBy: string): Promise<void> {
  const waiting = await db
    .select({ userId: commissions.userId })
    .from(commissions)
    .where(and(eq(commissions.waitlist, true), eq(commissions.status, "new")))
    .orderBy(asc(commissions.createdAt));
  const userIds = [...new Set(waiting.map((w) => w.userId))];
  if (userIds.length === 0) return;
  await broadcast({
    title: "Commissions are open. Your slot is waiting.",
    deepLink: "/commissions",
    audience: { type: "users", userIds },
    kind: "manual",
    createdBy,
    respectQuietHours: false,
  });
}
