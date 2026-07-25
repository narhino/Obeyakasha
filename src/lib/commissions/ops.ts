import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { commissions, grants } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { broadcast, notifyGoddess } from "@/lib/push/broadcast";
import { copy } from "@/copy/copy";
import { stageInfo, type CommissionStage } from "./stages";

export type CommissionStatus =
  | "new"
  | "reviewing"
  | "accepted"
  | "in_progress"
  | "delivered"
  | "declined"
  | "closed";

/** Statuses that mean a real request is still occupying a slot (not a mere
 *  waitlist ping, and not finished/refused). Used to enforce "one at a time". */
export const ACTIVE_COMMISSION_STATUSES = [
  "new",
  "reviewing",
  "accepted",
  "in_progress",
] as const;

/** Does this subject already have a live request in my hands? (waitlist pings
 *  don't count — they hold no slot). */
export async function hasActiveCommission(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: commissions.id })
    .from(commissions)
    .where(
      and(
        eq(commissions.userId, userId),
        eq(commissions.waitlist, false),
        inArray(commissions.status, [...ACTIVE_COMMISSION_STATUSES]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * THE COMMISSION IDENTITY INVARIANT (R-anon). `commissions.userId` is nullable
 * so a stranger can petition her, which means a row could otherwise be written
 * with no one attached to it at all — unanswerable, undeliverable, invisible.
 * Every insert path goes through this: a row must carry EITHER a real account
 * OR a reply address. Drizzle has no portable CHECK helper, so this function IS
 * the constraint; it throws rather than silently writing an orphan.
 */
export function assertCommissionIdentity(row: {
  userId?: string | null;
  guestEmail?: string | null;
}): void {
  const hasUser = typeof row.userId === "string" && row.userId.trim() !== "";
  const hasEmail =
    typeof row.guestEmail === "string" && row.guestEmail.trim() !== "";
  if (!hasUser && !hasEmail) {
    throw new Error("commission_identity_required");
  }
}

/** Subject submits a commission request (or joins the waitlist if closed).
 *  Refuses a duplicate active request when open (defence in depth — the UI
 *  already hides the form in that state). */
export async function submitCommission(
  userId: string,
  answers: Record<string, unknown>,
): Promise<{ waitlisted: boolean; duplicate?: boolean }> {
  assertCommissionIdentity({ userId });
  const open = await getSetting("commissions_open");
  if (open && (await hasActiveCommission(userId))) {
    return { waitlisted: false, duplicate: true };
  }
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

/**
 * A STRANGER petitions her (R-anon) — no account, only an address to answer at.
 * Obeys exactly the same open/sealed state machine as a subject's request: when
 * commissions are sealed this lands as a waitlist row, never as a live request,
 * so an anonymous caller can never walk past a closed board.
 *
 * "One at a time" is deliberately NOT enforced here: it keys off an account, and
 * a guest has none. The throttle in `./throttle.ts` is what stands in its place.
 */
export async function submitGuestCommission(input: {
  email: string;
  name?: string | null;
  answers: Record<string, unknown>;
}): Promise<{ waitlisted: boolean }> {
  const guestEmail = input.email.trim();
  const guestName = input.name?.trim() || null;
  assertCommissionIdentity({ guestEmail });
  const open = await getSetting("commissions_open");
  await db.insert(commissions).values({
    userId: null,
    guestEmail,
    guestName,
    answers: input.answers,
    waitlist: !open,
    status: "new",
  });
  await notifyGoddess(
    open
      ? "A new commission — from someone with no account yet."
      : "Someone with no account petitioned the waitlist.",
    "",
    "/sanctum/commissions",
  );
  return { waitlisted: !open };
}

export async function setCommissionStatus(
  commissionId: string,
  status: CommissionStatus,
): Promise<void> {
  // Accepting starts the turnaround clock (buyer's ETA) once.
  const startsClock = status === "accepted" || status === "in_progress";
  const [c] = await db
    .select({ acceptedAt: commissions.acceptedAt })
    .from(commissions)
    .where(eq(commissions.id, commissionId))
    .limit(1);
  await db
    .update(commissions)
    .set({
      status,
      acceptedAt:
        startsClock && !c?.acceptedAt ? new Date() : (c?.acceptedAt ?? undefined),
      updatedAt: new Date(),
    })
    .where(eq(commissions.id, commissionId));
}

/** Advance the production stage and tell the buyer, in her voice. */
export async function setCommissionStage(
  commissionId: string,
  stage: CommissionStage,
  actorId: string,
): Promise<void> {
  const [c] = await db
    .select({ userId: commissions.userId })
    .from(commissions)
    .where(eq(commissions.id, commissionId))
    .limit(1);
  if (!c) throw new Error("No commission");
  await db
    .update(commissions)
    .set({ stage, updatedAt: new Date() })
    .where(eq(commissions.id, commissionId));
  // GUEST GUARD (R-anon): there is no subject to push to and no /commissions
  // progress view for them to open. The stage still advances — she is tracking
  // her own work — it simply reaches nobody. NEVER broadcast to a null user.
  if (!c.userId) return;
  await broadcast({
    title: stageInfo(stage).buyer,
    deepLink: "/commissions",
    audience: { type: "users", userIds: [c.userId] },
    kind: "manual",
    createdBy: actorId,
    respectQuietHours: false,
  });
}

/** A subject's own commissions (for the progress view). */
export async function getUserCommissions(userId: string) {
  return db
    .select({
      id: commissions.id,
      status: commissions.status,
      stage: commissions.stage,
      acceptedAt: commissions.acceptedAt,
      createdAt: commissions.createdAt,
      waitlist: commissions.waitlist,
      deliveredTrackId: commissions.deliveredTrackId,
    })
    .from(commissions)
    .where(eq(commissions.userId, userId))
    .orderBy(desc(commissions.createdAt));
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
  // GUEST GUARD (R-anon): a delivery is a GRANT against a user row, and a guest
  // has none — there is no library to put the file in. Refuse loudly rather than
  // writing a grant with a null owner. The Sanctum board hides the deliver form
  // for guests and tells her to have them connect first; this is the backstop.
  if (!c.userId) {
    throw new Error(
      "No account yet — have them connect with Patreon before delivering.",
    );
  }

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

/** When commissions reopen, notify waitlisted petitioners in order (A14).
 *  GUEST GUARD (R-anon): a waitlisted stranger has no device and no account to
 *  push to, so the query excludes null userIds outright — she reaches them from
 *  the board with the address they left. NEVER push to a null user. */
export async function notifyWaitlistReopened(createdBy: string): Promise<void> {
  const waiting = await db
    .select({ userId: commissions.userId })
    .from(commissions)
    .where(
      and(
        eq(commissions.waitlist, true),
        eq(commissions.status, "new"),
        isNotNull(commissions.userId),
      ),
    )
    .orderBy(asc(commissions.createdAt));
  const userIds = [
    ...new Set(waiting.map((w) => w.userId).filter((id): id is string => !!id)),
  ];
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
