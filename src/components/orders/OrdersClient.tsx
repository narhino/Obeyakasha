"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Whisper } from "@/components/ui";

interface Order {
  id: string;
  title: string;
  body: string | null;
  requires: "ack" | "text" | "none";
  status: "sent" | "seen" | "done" | "lapsed";
}

export function OrdersClient({ orders }: { orders: Order[] }) {
  return (
    <div className="mt-6 space-y-3">
      {orders.map((o) => (
        <OrderItem key={o.id} order={o} />
      ))}
    </div>
  );
}

function OrderItem({ order }: { order: Order }) {
  const [done, setDone] = useState(order.status === "done");
  const [text, setText] = useState("");
  const router = useRouter();

  async function complete() {
    await fetch(`/api/orders/${order.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: text || null }),
    });
    setDone(true);
    router.refresh();
  }

  return (
    <Card raised className={done ? "opacity-60" : ""}>
      <p className="font-[family-name:var(--font-display)] text-lg">
        {order.title}
      </p>
      {order.body ? <Whisper className="mt-1">{order.body}</Whisper> : null}
      {done ? (
        <Whisper className="mt-2 text-gold">Done. Good.</Whisper>
      ) : (
        <div className="mt-3">
          {order.requires === "text" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Reply to obey."
              className="mb-2 w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text focus:border-gold focus:outline-none"
            />
          ) : null}
          <Button
            variant="gold"
            size="sm"
            disabled={order.requires === "text" && !text.trim()}
            onClick={complete}
          >
            {order.requires === "text" ? "Obey" : "Done"}
          </Button>
        </div>
      )}
    </Card>
  );
}
