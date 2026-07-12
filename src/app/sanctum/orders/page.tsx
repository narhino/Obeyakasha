import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderAssignments, orders } from "@/lib/db/schema";
import { Badge, Button, Card, Display, Input, Select, Whisper } from "@/components/ui";
import { createOrder } from "./actions";

export default async function SanctumOrders() {
  const rows = await db
    .select({
      id: orders.id,
      title: orders.title,
      createdAt: orders.createdAt,
      done: sql<number>`count(*) filter (where ${orderAssignments.status} = 'done')::int`,
      total: sql<number>`count(${orderAssignments.userId})::int`,
    })
    .from(orders)
    .leftJoin(orderAssignments, eq(orderAssignments.orderId, orders.id))
    .groupBy(orders.id)
    .orderBy(desc(orders.createdAt))
    .limit(20);

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Orders</Display>
      <Whisper className="mt-1">
        Tell them to do something. Completion feeds their chain.
      </Whisper>

      <Card className="mt-6">
        <form action={createOrder} className="space-y-3">
          <Input name="title" required placeholder="Listen to Devotion Doctrine tonight." className="w-full" />
          <Input name="body" placeholder="Optional detail…" className="w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <Select name="requires" defaultValue="ack">
              <option value="ack">Acknowledge</option>
              <option value="text">Reply required</option>
              <option value="none">No response</option>
            </Select>
            <Select name="audienceType" defaultValue="all">
              <option value="all">Everyone</option>
              <option value="level">Access level ≥</option>
            </Select>
            <Input name="level" type="number" min={0} max={99} defaultValue={1} className="w-24" />
          </div>
          <Button type="submit" variant="gold">
            Issue
          </Button>
        </form>
      </Card>

      <div className="mt-8 space-y-2">
        {rows.map((o) => (
          <Card key={o.id} className="flex items-center justify-between py-3">
            <p className="text-sm text-text">{o.title}</p>
            <Badge tone="gold">
              {o.done}/{o.total} done
            </Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
