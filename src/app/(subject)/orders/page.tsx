import { requireSubject } from "@/lib/auth-helpers";
import { ordersForSubject } from "@/lib/orders/ops";
import { mediaProvider } from "@/lib/media";
import { OrdersClient, type TaskItem } from "@/components/orders/OrdersClient";
import { Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

const PROOF_TTL_S = 6 * 60 * 60;

/** Sign a proof key for the subject's own thumbnail; never expose the key. */
async function signProof(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await mediaProvider().signStreamUrl(key, PROOF_TTL_S);
  } catch {
    return null;
  }
}

export default async function TasksPage() {
  const session = await requireSubject();
  const rows = await ordersForSubject(session.user.id);
  const items: TaskItem[] = await Promise.all(
    rows.map(async (o) => ({
      id: o.id,
      title: o.title,
      body: o.body,
      requires: o.requires,
      proofMode: o.proofMode,
      status: o.status,
      dueAt: o.dueAt ? o.dueAt.toISOString() : null,
      praised: Boolean(o.praisedAt),
      proofUrl: await signProof(o.proofKey),
    })),
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display className="text-3xl">{copy.tasks.title}</Display>
      {items.length === 0 ? (
        <Whisper className="mt-6">{copy.tasks.empty}</Whisper>
      ) : (
        <OrdersClient items={items} />
      )}
    </main>
  );
}
