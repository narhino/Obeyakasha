import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { moments, orderAssignments, orders, users } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { broadcast } from "@/lib/push/broadcast";
import { expandAudience } from "@/lib/push/audience";
import { keepChain } from "@/lib/chain/keep";
import { copy } from "@/copy/copy";

export type ProofMode = "none" | "optional" | "required";

/** Issue an order to an audience (A12) → assignments + push (R5: + proofMode). */
export async function issueOrder(params: {
  title: string;
  body?: string;
  audience: Audience;
  requires: "ack" | "text" | "none";
  proofMode?: ProofMode;
  dueAt?: Date | null;
  createdBy: string;
}): Promise<string> {
  const [order] = await db
    .insert(orders)
    .values({
      title: params.title,
      body: params.body,
      audience: params.audience,
      requires: params.requires,
      proofMode: params.proofMode ?? "none",
      dueAt: params.dueAt ?? null,
    })
    .returning();
  const orderId = order!.id;

  const userIds = await expandAudience(params.audience);
  for (const userId of userIds) {
    await db
      .insert(orderAssignments)
      .values({ orderId, userId, status: "sent" })
      .onConflictDoNothing();
  }

  await broadcast({
    title: copy.tasks.receivedPush.title,
    body: params.title,
    deepLink: "/orders",
    audience: params.audience,
    kind: "manual",
    createdBy: params.createdBy,
  });
  return orderId;
}

/** Subject completes/acknowledges an order; credits the chain (A7). */
export async function respondToOrder(
  userId: string,
  orderId: string,
  response: string | null,
): Promise<void> {
  // Defense-in-depth: a required-proof order can't be completed without proof,
  // even if the client is bypassed (the UI already disables Done).
  const [row] = await db
    .select({
      proofMode: orders.proofMode,
      proofKey: orderAssignments.proofKey,
    })
    .from(orderAssignments)
    .innerJoin(orders, eq(orders.id, orderAssignments.orderId))
    .where(
      and(
        eq(orderAssignments.orderId, orderId),
        eq(orderAssignments.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("no such task");
  if (row.proofMode === "required" && !row.proofKey) {
    throw new Error("proof required");
  }

  await db
    .update(orderAssignments)
    .set({ status: "done", response, doneAt: new Date() })
    .where(
      and(
        eq(orderAssignments.orderId, orderId),
        eq(orderAssignments.userId, userId),
      ),
    );
  await keepChain(userId, "mantra").catch(() => {});
}

/** A subject's orders/tasks (newest first; page splits active vs history). */
export async function ordersForSubject(userId: string) {
  return db
    .select({
      id: orders.id,
      title: orders.title,
      body: orders.body,
      requires: orders.requires,
      proofMode: orders.proofMode,
      dueAt: orders.dueAt,
      status: orderAssignments.status,
      proofKey: orderAssignments.proofKey,
      praisedAt: orderAssignments.praisedAt,
    })
    .from(orderAssignments)
    .innerJoin(orders, eq(orders.id, orderAssignments.orderId))
    .where(eq(orderAssignments.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(50);
}

/**
 * How many tasks a subject still owes (status sent|seen). Drives the danger
 * pulse on the Tasks tab. Cheap COUNT; the caller treats errors as zero.
 */
export async function pendingTaskCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderAssignments)
    .where(
      and(
        eq(orderAssignments.userId, userId),
        inArray(orderAssignments.status, ["sent", "seen"]),
      ),
    );
  return row?.n ?? 0;
}

/** Proofs awaiting (or receiving) her eye — newest attachment first (R5). */
export async function proofsForReview(limit = 40) {
  return db
    .select({
      orderId: orderAssignments.orderId,
      userId: orderAssignments.userId,
      orderTitle: orders.title,
      subjectName: users.chosenName,
      proofKey: orderAssignments.proofKey,
      praisedAt: orderAssignments.praisedAt,
      proofAt: orderAssignments.proofAt,
    })
    .from(orderAssignments)
    .innerJoin(orders, eq(orders.id, orderAssignments.orderId))
    .innerJoin(users, eq(users.id, orderAssignments.userId))
    .where(isNotNull(orderAssignments.proofKey))
    .orderBy(desc(orderAssignments.proofAt))
    .limit(limit);
}

/** She praises a proof: seal it, and whisper it to that one subject (R5). */
export async function praiseProof(
  userId: string,
  orderId: string,
  createdBy: string,
): Promise<void> {
  await db
    .update(orderAssignments)
    .set({ praisedAt: new Date() })
    .where(
      and(
        eq(orderAssignments.orderId, orderId),
        eq(orderAssignments.userId, userId),
      ),
    );
  // R7: the praise also lands as a ritual moment on their next session, so it's
  // felt even if the push was missed (deduped: the pop-up is a distinct surface).
  const [order] = await db
    .select({ title: orders.title })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  await db.insert(moments).values({
    userId,
    kind: "praised",
    payload: { orderTitle: order?.title ?? "" },
  });
  await broadcast({
    title: copy.tasks.praise.pushTitle,
    body: copy.tasks.praise.pushBody,
    deepLink: "/orders",
    audience: { type: "users", userIds: [userId] },
    kind: "manual",
    createdBy,
  });
}
