import { Card, Label, Ornament, Whisper } from "@/components/ui";
import { formatWhen } from "@/lib/format/when";
import { numberWord, plural } from "@/lib/format/plural";
import type { VaultData } from "@/lib/profile/vault";
import { copy, fill } from "@/copy/copy";

/** At most this many sealed plates are drawn; the tally line still counts them
 *  all, so a deep catalog teases without becoming a wall of mystery. */
const SEALED_SHOWN = 8;

/**
 * The Trigger Vault (R9.2) — "what she has installed in you". Acquired marks are
 * engraved gold plates (name · her words · when it took); the unearned are
 * sealed slots with no name, only the sigil and her line. Presentational: all
 * data (and its D7 safety) comes from `vaultFor`.
 */
export function TriggerVault({ carried, waiting }: VaultData) {
  const carriedCount = carried.length;
  const sealedShown = Math.min(waiting, SEALED_SHOWN);

  const tally =
    carriedCount === 0
      ? copy.you.vault.empty
      : fill(copy.you.vault.countCarried, {
          count: numberWord(carriedCount),
          unit: plural(carriedCount, "mark"),
        }) +
        (waiting > 0
          ? fill(copy.you.vault.countWaiting, { count: numberWord(waiting) })
          : copy.you.vault.countNoneWaiting);

  return (
    <Card className="mt-6">
      <Label>{copy.you.vault.title}</Label>
      <Whisper className="mt-1 font-[family-name:var(--font-display)] text-base italic">
        {copy.you.vault.lead}
      </Whisper>
      <Whisper className="mt-2 text-xs">{tally}</Whisper>

      {carriedCount === 0 && waiting === 0 ? null : (
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {carried.map((t) => (
            <div
              key={t.name}
              className="rounded-[var(--radius-lg)] border border-gold/30 bg-accent-soft/20 p-3.5"
            >
              <p className="font-[family-name:var(--font-display)] text-lg leading-tight text-gold">
                {t.name}
              </p>
              {t.description ? (
                <p className="mt-1 text-sm leading-relaxed text-text-dim">
                  {t.description}
                </p>
              ) : null}
              <p className="mt-2 text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim/70">
                {copy.you.vault.carriedLabel} · {formatWhen(t.acquiredAt)}
              </p>
            </div>
          ))}

          {Array.from({ length: sealedShown }).map((_, i) => (
            <div
              key={`sealed-${i}`}
              className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-line/70 bg-surface/50 p-3.5 text-center"
            >
              <Ornament className="w-16" />
              <p className="mt-2 text-sm italic text-text-dim/80">
                {copy.you.vault.sealed}
              </p>
              <p className="mt-2 text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim/50">
                {copy.you.vault.sealedLabel}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
