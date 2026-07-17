import Link from "next/link";
import { requireSubject } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { getCommissionForm } from "@/lib/commissions/form";
import {
  ACTIVE_COMMISSION_STATUSES,
  getUserCommissions,
} from "@/lib/commissions/ops";
import {
  COMMISSION_STAGES,
  daysLeft,
  stageInfo,
} from "@/lib/commissions/stages";
import { CommissionForm } from "@/components/commissions/CommissionForm";
import { Badge, Card, Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

export const dynamic = "force-dynamic";

const ACTIVE = new Set<string>(ACTIVE_COMMISSION_STATUSES);

export default async function CommissionsPage() {
  const session = await requireSubject();
  const [open, fields, mine, etaDays] = await Promise.all([
    getSetting("commissions_open"),
    getCommissionForm(),
    getUserCommissions(session.user.id),
    getSetting("commission_eta_days"),
  ]);

  // Shown as progress cards: everything not declined (delivered included).
  const shown = mine.filter((c) => c.status !== "declined");
  // A real request still in her hands (waitlist pings hold no slot).
  const hasActive = mine.some((c) => !c.waitlist && ACTIVE.has(c.status));
  // Already waiting in line while sealed.
  const alreadyWaitlisted = mine.some(
    (c) => c.waitlist && (c.status === "new" || c.status === "reviewing"),
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display className="text-3xl">
        {open ? copy.comm.openTitle : copy.comm.sealedTitle}
      </Display>
      <Whisper className="mt-1">
        {open ? copy.comm.openBody : copy.comm.sealed}
      </Whisper>

      {shown.length > 0 ? (
        <div className="mt-6 space-y-3">
          {shown.map((c) => {
            const info = stageInfo(c.stage);
            const left = daysLeft(c.acceptedAt, etaDays);
            const delivered = c.status === "delivered";
            const waiting = c.status === "new" || c.status === "reviewing";
            const stepIndex = COMMISSION_STAGES.findIndex(
              (s) => s.key === c.stage,
            );
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

                {/* Labelled milestone stepper, not a bare bar (F32). */}
                <ol className="mt-4 flex items-start gap-1.5">
                  {COMMISSION_STAGES.map((s, idx) => {
                    const reached = stepIndex >= 0 && idx <= stepIndex;
                    const current = idx === stepIndex;
                    return (
                      <li
                        key={s.key}
                        className="flex flex-1 flex-col items-center gap-1.5 text-center"
                      >
                        <span
                          className={`h-1.5 w-full rounded-full transition-colors duration-700 ${
                            reached ? "bg-gold" : "bg-surface-raised"
                          }`}
                        />
                        <span
                          className={`text-[0.5625rem] tracking-[0.1em] uppercase ${
                            current
                              ? "text-gold"
                              : reached
                                ? "text-text-dim"
                                : "text-text-dim/40"
                          }`}
                        >
                          {copy.comm.stageSteps[s.key]}
                        </span>
                      </li>
                    );
                  })}
                </ol>

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

      {/* State machine (F04):
          · sealed + not waiting → the waitlist petition ONLY (no field form)
          · sealed + waiting     → "you're on my waitlist" note
          · open + has active    → "one at a time" (progress shown above)
          · open + nothing       → the full request form */}
      {!open ? (
        alreadyWaitlisted ? (
          <Whisper className="mt-8 font-[family-name:var(--font-display)] text-base italic text-gold">
            {copy.comm.waitlisted}
          </Whisper>
        ) : (
          <CommissionForm fields={[]} variant="waitlist" />
        )
      ) : hasActive ? (
        <Whisper className="mt-8 font-[family-name:var(--font-display)] text-base italic text-gold">
          {copy.comm.oneAtATime}
        </Whisper>
      ) : (
        <CommissionForm fields={fields} variant="full" />
      )}
    </main>
  );
}
