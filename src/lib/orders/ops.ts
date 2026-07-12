import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderAssignments, orders } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { broadcast } from "@/lib/push/broadcast";
import { expandAudience } from "@/lib/push/audience";
import { keepChain } from "@/lib/chain/keep";

/** Issue an order to an audience (A12) → assignments + push. */
export async function issueOrder(params: {
  title: string;
  body?: string;
  audience: Audience;
  requires: "ack" | "text" | "none";
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
    title: "An order.",
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

/** A subject's orders (pending first). */
export async function ordersForSubject(userId: string) {
  return db
    .select({
      id: orders.id,
      title: orders.title,
      body: orders.body,
      requires: orders.requires,
      dueAt: orders.dueAt,
      status: orderAssignments.status,
    })
    .from(orderAssignments)
    .innerJoin(orders, eq(orders.id, orderAssignments.orderId))
    .where(eq(orderAssignments.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(50);
}
