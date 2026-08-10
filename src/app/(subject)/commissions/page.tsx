import type { Metadata } from "next";
import { publicMeta } from "@/lib/seo/site";
import Link from "next/link";
import { auth } from "@/auth";
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
import { Badge, Button, Card, Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

/** Public (R-anon): a stranger may read the terms and petition her. */
export const metadata: Metadata = publicMeta({
  title: copy.seo.commissionsTitle,
  description: copy.seo.commissionsDescription,
  path: "/commissions",
});

export const dynamic = "force-dynamic";

const ACTIVE = new Set<string>(ACTIVE_COMMISSION_STATUSES);

/**
 * The commission room. Public since R-anon: a stranger may read the same terms
 * and petition her with an address, and gets an anonymous variant of the form.
 * A signed-in subject's page is unchanged — their progress cards, their
 * one-at-a-time rule, no email field (their account IS the address).
 */
export default async function CommissionsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const guest = !userId;
  const [open, fields, mine, etaDays] = await Promise.all([
    getSetting("commissions_open"),
    getCommissionForm(),
    // D7 + guests: a stranger has no rows of their own, and must never be shown
    // anyone else's. No id, no query.
    userId
      ? getUserCommissions(userId)
      : Promise.resolve([] as Awaited<ReturnType<typeof getUserCommissions>>),
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
      <Display size="opener">
        {open ? copy.comm.openTitle : copy.comm.sealedTitle}
      </Display>
      <Whisper className="mt-1">
        {open ? copy.comm.openBody : copy.comm.sealed}
      </Whisper>

      {/* R-anon: a stranger is told plainly where a finished file would land,
          and offered the door — never blocked by it. */}
      {guest ? (
        <Card className="mt-6 border-gold/30">
          <p className="font-[family-name:var(--font-display)] text-lg italic text-text">
            {copy.comm.guest.connectTitle}
          </p>
          <Whisper className="mt-1.5">{copy.comm.guest.connectBody}</Whisper>
          <Link href="/signin" className="mt-4 inline-block">
            <Button size="sm" variant="gold">
              {copy.auth.signInButton}
            </Button>
          </Link>
        </Card>
      ) : null}

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

      {/* State machine (F04) — IDENTICAL for a stranger, who has no rows and so
          always falls to the form branch. A guest can never walk past a sealed
          board; sealed still means the waitlist petition, never the full form.
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
          <CommissionForm fields={[]} variant="waitlist" guest={guest} />
        )
      ) : hasActive ? (
        <Whisper className="mt-8 font-[family-name:var(--font-display)] text-base italic text-gold">
          {copy.comm.oneAtATime}
        </Whisper>
      ) : (
        <CommissionForm fields={fields} variant="full" guest={guest} />
      )}
    </main>
  );
}
