import { requireSubject } from "@/lib/auth-helpers";
import { ordersForSubject } from "@/lib/orders/ops";
import { OrdersClient } from "@/components/orders/OrdersClient";
import { Display, Whisper } from "@/components/ui";

export default async function OrdersPage() {
  const session = await requireSubject();
  const orders = await ordersForSubject(session.user.id);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display className="text-3xl">Orders</Display>
      {orders.length === 0 ? (
        <Whisper className="mt-6">No orders. Rest — for now.</Whisper>
      ) : (
        <OrdersClient orders={orders} />
      )}
    </main>
  );
}
