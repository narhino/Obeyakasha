import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { commissions, tracks, users } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { Badge, Button, Card, Display, Select, Whisper } from "@/components/ui";
import { COMMISSION_STAGES, stageInfo } from "@/lib/commissions/stages";
import {
  deliverCommissionAction,
  toggleCommissions,
  updateCommissionStage,
  updateCommissionStatus,
} from "./actions";

const STATUSES = [
  "new",
  "reviewing",
  "accepted",
  "in_progress",
  "delivered",
  "declined",
  "closed",
];

export default async function SanctumCommissions() {
  const [open, rows, deliverable] = await Promise.all([
    getSetting("commissions_open"),
    db
      .select({
        c: commissions,
        name: users.chosenName,
        email: users.email,
      })
      .from(commissions)
      .innerJoin(users, eq(users.id, commissions.userId))
      .orderBy(desc(commissions.createdAt))
      .limit(50),
    db
      .select({ id: tracks.id, title: tracks.title })
      .from(tracks)
      .limit(200),
  ]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <Display className="text-3xl">Commissions</Display>
        <form action={toggleCommissions}>
          <Button type="submit" variant={open ? "ghost" : "gold"} size="sm">
            {open ? "Open — click to seal" : "Sealed — click to open"}
          </Button>
        </form>
      </div>
      <Whisper className="mt-1">
        Requests come here. Deliver a finished track privately to the person who
        asked.
      </Whisper>

      <div className="mt-6 space-y-4">
        {rows.length === 0 ? (
          <Card>
            <Whisper>No requests yet.</Whisper>
          </Card>
        ) : (
          rows.map(({ c, name, email }) => (
            <Card key={c.id} raised>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-text">{name ?? email}</p>
                <div className="flex items-center gap-2">
                  {c.waitlist ? <Badge tone="sealed">waitlist</Badge> : null}
                  <Badge tone={c.status === "delivered" ? "gold" : "neutral"}>
                    {c.status}
                  </Badge>
                </div>
              </div>

              <dl className="mt-2 space-y-1 text-sm">
                {Object.entries(c.answers as Record<string, unknown>).map(
                  ([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="shrink-0 text-text-dim">{k}:</dt>
                      <dd className="text-text">{String(v)}</dd>
                    </div>
                  ),
                )}
              </dl>

              {/* Production stage the buyer sees as a progress bar */}
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-text-dim">
                  <span>Stage: {stageInfo(c.stage).admin}</span>
                  <span>{stageInfo(c.stage).pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{ width: `${stageInfo(c.stage).pct}%` }}
                  />
                </div>
                <form
                  action={updateCommissionStage}
                  className="mt-2 flex items-center gap-1"
                >
                  <input type="hidden" name="commissionId" value={c.id} />
                  <Select name="stage" defaultValue={c.stage}>
                    {COMMISSION_STAGES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.admin}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="ghost">
                    Update stage
                  </Button>
                </form>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={updateCommissionStatus} className="flex items-center gap-1">
                  <input type="hidden" name="commissionId" value={c.id} />
                  <Select name="status" defaultValue={c.status}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="ghost">
                    Set
                  </Button>
                </form>

                <form action={deliverCommissionAction} className="flex items-center gap-1">
                  <input type="hidden" name="commissionId" value={c.id} />
                  <Select name="trackId">
                    <option value="">deliver track…</option>
                    {deliverable.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="gold">
                    Deliver
                  </Button>
                </form>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
