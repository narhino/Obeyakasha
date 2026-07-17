import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderAssignments, orders } from "@/lib/db/schema";
import { proofsForReview } from "@/lib/orders/ops";
import { mediaProvider } from "@/lib/media";
import {
  Badge,
  Button,
  Card,
  Display,
  Input,
  Label,
  Select,
  Whisper,
} from "@/components/ui";
import { IconSeal } from "@/components/ui/icons";
import { createOrder, praiseProofAction } from "./actions";

const PROOF_TTL_S = 6 * 60 * 60;

async function signProof(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await mediaProvider().signStreamUrl(key, PROOF_TTL_S);
  } catch {
    return null;
  }
}

export default async function SanctumOrders() {
  const [rows, proofRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        title: orders.title,
        proofMode: orders.proofMode,
        dueAt: orders.dueAt,
        createdAt: orders.createdAt,
        done: sql<number>`count(*) filter (where ${orderAssignments.status} = 'done')::int`,
        total: sql<number>`count(${orderAssignments.userId})::int`,
      })
      .from(orders)
      .leftJoin(orderAssignments, eq(orderAssignments.orderId, orders.id))
      .groupBy(orders.id)
      .orderBy(desc(orders.createdAt))
      .limit(20),
    proofsForReview(),
  ]);

  const proofs = await Promise.all(
    proofRows.map(async (p) => ({ ...p, url: await signProof(p.proofKey) })),
  );

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Orders</Display>
      <Whisper className="mt-1">
        Tell them to do something. Completion feeds their chain.
      </Whisper>

      <Card className="mt-6">
        <form action={createOrder} className="space-y-3">
          <Input
            name="title"
            required
            placeholder="Listen to Devotion Doctrine tonight."
            className="w-full"
          />
          <Input name="body" placeholder="Optional detail…" className="w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Requires
              <Select name="requires" defaultValue="ack">
                <option value="ack">Acknowledge</option>
                <option value="text">Reply required</option>
                <option value="none">No response</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Photo proof
              <Select name="proofMode" defaultValue="none">
                <option value="none">Not asked</option>
                <option value="optional">Optional</option>
                <option value="required">Required</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Deadline
              <Input name="dueAt" type="datetime-local" className="w-52" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Audience
              <Select name="audienceType" defaultValue="all">
                <option value="all">Everyone</option>
                <option value="level">Access level ≥</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Level
              <Input
                name="level"
                type="number"
                min={0}
                max={99}
                defaultValue={1}
                className="w-24"
              />
            </label>
          </div>
          <Button type="submit" variant="gold">
            Issue
          </Button>
        </form>
      </Card>

      {/* Proof review — newest attachment first (R5). */}
      {proofs.length > 0 ? (
        <div className="mt-8">
          <Label>Proof to review</Label>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {proofs.map((p) => (
              <Card key={`${p.orderId}:${p.userId}`} raised className="p-3">
                <div className="aspect-square w-full overflow-hidden rounded-[var(--radius)] border border-line/80 bg-surface">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={p.url} target="_blank" rel="noreferrer">
                      <img
                        src={p.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ) : null}
                </div>
                <p className="mt-2 truncate text-sm text-text">
                  {p.subjectName ?? "a subject"}
                </p>
                <p className="truncate text-xs text-text-dim">{p.orderTitle}</p>
                {p.praisedAt ? (
                  <span className="mt-2 inline-flex items-center gap-1 text-[0.6875rem] tracking-[0.08em] uppercase text-gold">
                    <IconSeal size={13} />
                    Praised
                  </span>
                ) : (
                  <form action={praiseProofAction} className="mt-2">
                    <input type="hidden" name="orderId" value={p.orderId} />
                    <input type="hidden" name="userId" value={p.userId} />
                    <Button type="submit" variant="gold" size="sm">
                      Praise
                    </Button>
                  </form>
                )}
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8 space-y-2">
        <Label>Issued</Label>
        {rows.map((o) => (
          <Card key={o.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-text">{o.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {o.proofMode !== "none" ? (
                  <Badge tone="sealed">
                    {o.proofMode === "required" ? "Proof required" : "Proof optional"}
                  </Badge>
                ) : null}
                {o.dueAt ? (
                  <span className="text-[0.6875rem] text-text-dim/70">
                    due {o.dueAt.toLocaleDateString()}
                  </span>
                ) : null}
              </div>
            </div>
            <Badge tone="gold">
              {o.done}/{o.total} done
            </Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
