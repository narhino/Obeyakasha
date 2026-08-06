import { Button, Card, Display, Whisper } from "@/components/ui";
import { copy, fill } from "@/copy/copy";
import { RecheckPledge } from "./RecheckPledge";

/**
 * What state a subject is in with her, explained where they will actually look.
 *
 * Subjects kept asking what "frozen" and "sealed" meant, and the app had no
 * good answer: one small banner on the Library, and every locked file saying
 * "rise to level N" — which reads as "you never earned this" to someone who HAD
 * earned it and simply stopped pledging. So each state here names the cause,
 * says what survives, and carries the door out. Nothing is a dead end.
 *
 * `tone` picks the weight: "full" for the You page (the standing, stated), and
 * "banner" for pages where it sits above other work (Library).
 */
export type StandingState = "frozen" | "grace" | "threshold" | "active";

export function standingOf(access: {
  frozen: boolean;
  inGrace: boolean;
  accessLevel: number;
}): StandingState {
  if (access.frozen) return "frozen";
  if (access.inGrace) return "grace";
  if (access.accessLevel <= 0) return "threshold";
  return "active";
}

export function Standing({
  state,
  level,
  patreonPageUrl,
  tone = "full",
}: {
  state: StandingState;
  level: number;
  patreonPageUrl: string;
  tone?: "full" | "banner";
}) {
  // Current and covered: one quiet line, never an alarm. The banner form says
  // nothing at all — a healthy subject should not be told they're healthy every
  // time they open the Library.
  if (state === "active") {
    if (tone === "banner") return null;
    return (
      <Card>
        <Whisper className="text-xs uppercase tracking-wide">
          {copy.standing.label}
        </Whisper>
        <p className="mt-1 font-[family-name:var(--font-display)] text-lg text-text">
          {copy.standing.activeTitle}
        </p>
        <Whisper className="mt-1 text-sm">
          {fill(copy.standing.activeLevel, { level: String(level) })}
        </Whisper>
      </Card>
    );
  }

  const frozen = state === "frozen";
  const grace = state === "grace";

  return (
    <Card
      raised={tone === "full"}
      className={frozen ? "border-danger/40" : "border-gold/40"}
    >
      <Whisper className="text-xs uppercase tracking-wide">
        {copy.standing.label}
      </Whisper>

      {tone === "full" ? (
        <Display as="h2" className="mt-1 text-xl">
          {frozen
            ? copy.standing.frozenTitle
            : grace
              ? copy.standing.graceTitle
              : copy.standing.thresholdTitle}
        </Display>
      ) : (
        <p className="mt-1 font-[family-name:var(--font-display)] text-lg text-text">
          {frozen
            ? copy.standing.frozenTitle
            : grace
              ? copy.standing.graceTitle
              : copy.standing.thresholdTitle}
        </p>
      )}

      {/* The explanation itself — the thing they were asking her for. */}
      <div className="mt-3 space-y-2">
        <Whisper className="text-sm leading-relaxed text-text">
          {frozen
            ? copy.standing.frozenWhat
            : grace
              ? copy.standing.graceWhat
              : copy.standing.thresholdWhat}
        </Whisper>
        {frozen ? (
          <>
            <Whisper className="text-sm leading-relaxed">
              {copy.standing.frozenKept}
            </Whisper>
            <Whisper className="text-sm leading-relaxed">
              {copy.standing.frozenBack}
            </Whisper>
          </>
        ) : null}
        {grace ? (
          <Whisper className="text-sm leading-relaxed">
            {copy.standing.graceBack}
          </Whisper>
        ) : null}
      </div>

      {/* The way out is a real button, not a line of underlined text buried in
          a paragraph — this is the single action the whole card exists for. */}
      <div className="mt-4">
        <a href={patreonPageUrl} target="_blank" rel="noreferrer">
          <Button variant="gold" size={tone === "full" ? "lg" : "sm"}>
            {frozen
              ? copy.standing.frozenCta
              : grace
                ? copy.standing.graceCta
                : copy.standing.thresholdCta}
          </Button>
        </a>
        <Whisper className="mt-1.5 text-xs">{copy.standing.frozenWhere}</Whisper>
        {/* For the ones who already paid and are still looking at this card —
            the whole reason it's still showing is that nothing re-read Patreon
            for them. One tap does it, with their own token. */}
        {frozen || grace ? <RecheckPledge /> : null}
      </div>
    </Card>
  );
}
