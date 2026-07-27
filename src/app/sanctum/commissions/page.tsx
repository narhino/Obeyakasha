import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { commissions, tracks, users } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { Badge, Button, Card, PageHeading, Select, Whisper } from "@/components/ui";
import {
  COMMISSION_STAGES,
  commissionStatusLabel,
  stageInfo,
} from "@/lib/commissions/stages";
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
    // LEFT join (R-anon): a guest commission has no user row, and an inner join
    // would have hidden it from her board entirely.
    db
      .select({
        c: commissions,
        name: users.chosenName,
        email: users.email,
      })
      .from(commissions)
      .leftJoin(users, eq(users.id, commissions.userId))
      .orderBy(desc(commissions.createdAt))
      .limit(50),
    db
      .select({ id: tracks.id, title: tracks.title })
      .from(tracks)
      .limit(200),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeading
        eyebrow="Duties"
        trailing={
          <form action={toggleCommissions}>
            <Button type="submit" variant={open ? "ghost" : "gold"} size="sm">
              {open ? "Open — click to seal" : "Sealed — click to open"}
            </Button>
          </form>
        }
      >
        Commissions
      </PageHeading>
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
          rows.map(({ c, name, email }) => {
            // R-anon: no user row → this came from a stranger. Her only way back
            // to them is the address they left, so it is shown plainly, right
            // beside the same accept / decline / stage controls.
            const isGuest = c.userId == null;
            const who = isGuest
              ? (c.guestName ?? c.guestEmail)
              : (name ?? email);
            const replyTo = isGuest ? c.guestEmail : email;
            return (
            <Card key={c.id} raised>
              <div className="flex items-center justify-between gap-2">
                {/* A commission is from a person — her way to everything else
                    about them is their name, so the name is the door. */}
                {isGuest || !c.userId ? (
                  <p className="text-sm text-text">{who}</p>
                ) : (
                  <Link
                    href={`/sanctum/subjects/${c.userId}`}
                    className="text-sm text-text transition-colors hover:text-gold"
                  >
                    {who}
                  </Link>
                )}
                <div className="flex items-center gap-2">
                  {isGuest ? <Badge tone="sealed">no account yet</Badge> : null}
                  {c.waitlist ? <Badge tone="sealed">waitlist</Badge> : null}
                  <Badge tone={c.status === "delivered" ? "gold" : "neutral"}>
                    {commissionStatusLabel(c.status)}
                  </Badge>
                </div>
              </div>

              {replyTo ? (
                <p className="mt-1 text-xs text-text-dim">
                  Reply to:{" "}
                  <a href={`mailto:${replyTo}`} className="text-gold underline">
                    {replyTo}
                  </a>
                </p>
              ) : null}

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
                {isGuest ? (
                  <Whisper className="mt-1 text-xs">
                    Tracked for you only — with no account there is nowhere to
                    push this, and no progress page for them to open.
                  </Whisper>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={updateCommissionStatus} className="flex items-center gap-1">
                  <input type="hidden" name="commissionId" value={c.id} />
                  <Select name="status" defaultValue={c.status}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {commissionStatusLabel(s)}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm" variant="ghost">
                    Set
                  </Button>
                </form>

                {/* Delivery is a GRANT against a user row. A guest has none, so
                    the control is replaced by the reason rather than left to
                    fail — she must get them to connect first. */}
                {isGuest ? (
                  <Whisper className="text-xs">
                    No library to deliver into yet — have them connect with
                    Patreon, then deliver.
                  </Whisper>
                ) : (
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
                )}
              </div>
            </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
