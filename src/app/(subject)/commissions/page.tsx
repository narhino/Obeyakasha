import Link from "next/link";
import { requireSubject } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { getCommissionForm } from "@/lib/commissions/form";
import { getUserCommissions } from "@/lib/commissions/ops";
import { daysLeft, stageInfo } from "@/lib/commissions/stages";
import { CommissionForm } from "@/components/commissions/CommissionForm";
import { Badge, Card, Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

export const dynamic = "force-dynamic";

export default async function CommissionsPage() {
  const session = await requireSubject();
  const [open, fields, mine, etaDays] = await Promise.all([
    getSetting("commissions_open"),
    getCommissionForm(),
    getUserCommissions(session.user.id),
    getSetting("commission_eta_days"),
  ]);

  const active = mine.filter((c) => c.status !== "declined");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display className="text-3xl">
        {open ? copy.comm.openTitle : "Commissions are sealed"}
      </Display>
      <Whisper className="mt-1">
        {open ? copy.comm.openBody : copy.comm.sealed}
      </Whisper>

      {active.length > 0 ? (
        <div className="mt-6 space-y-3">
          {active.map((c) => {
            const info = stageInfo(c.stage);
            const left = daysLeft(c.acceptedAt, etaDays);
            const delivered = c.status === "delivered";
            const waiting = c.status === "new" || c.status === "reviewing";
            return (
              <Card key={c.id} raised>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-[family-name:var(--font-display)] italic text-text">
                    {delivered ? "It's yours." : info.buyer}
                  </p>
                  {c.waitlist && waiting ? (
                    <Badge tone="sealed">waitlisted</Badge>
                  ) : delivered ? (
                    <Badge tone="gold">delivered</Badge>
                  ) : null}
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-gold transition-[width] duration-700"
                    style={{ width: `${info.pct}%` }}
                  />
                </div>

                <Whisper className="mt-2 text-xs">
                  {delivered ? (
                    <>
                      Waiting for you in{" "}
                      <Link href="/library" className="text-gold hover:underline">
                        your library
                      </Link>
                      .
                    </>
                  ) : waiting ? (
                    "She hasn't taken it up yet. Patience."
                  ) : left !== null ? (
                    `≈ ${left} day${left === 1 ? "" : "s"} left · usually within ${etaDays}`
                  ) : (
                    `Usually within ${etaDays} days`
                  )}
                </Whisper>
              </Card>
            );
          })}
        </div>
      ) : null}

      <div className="mt-8">
        <CommissionForm fields={fields} open={open} />
      </div>
    </main>
  );
}
