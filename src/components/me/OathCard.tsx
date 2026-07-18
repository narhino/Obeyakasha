"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Display, Label, Ornament, Whisper } from "@/components/ui";
import { IconCollar } from "@/components/ui/icons";
import { defaultCoverFor } from "@/lib/art/defaults";
import type { OathState } from "@/lib/oath/logic";
import { copy, fill } from "@/copy/copy";

/** The collar's own bespoke art (gold collar on velvet), for the ceremonial plate. */
const COLLAR_ART = defaultCoverFor(["collar"]);

/**
 * The Oath card (R9.5) — the collar, below the chain on You. One of four states:
 *  - sealed     → the engraved requirement: what it takes, where they stand;
 *  - eligible   → the ritual "Petition for her collar" CTA → confirm overlay;
 *  - petitioned → "She is considering you." — the wait;
 *  - collared   → the oath plate: "Hers. Since {date}."
 * Token-only; the confirm overlay follows the ritual layout (DESIGN rule 4:
 * Display → Ornament → Whisper → CTA) and honours reduced-motion via global CSS.
 */
export function OathCard({
  state,
  currentStreak,
  minStreak,
  sinceLabel,
}: {
  state: OathState;
  currentStreak: number;
  minStreak: number;
  /** Formatted date she collared them — required for the `collared` plate. */
  sinceLabel: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [visible, setVisible] = useState(false);
  const [sending, setSending] = useState(false);

  function openConfirm() {
    setConfirming(true);
    requestAnimationFrame(() => setVisible(true));
  }
  function closeConfirm() {
    setVisible(false);
    window.setTimeout(() => setConfirming(false), 280);
  }

  async function petition() {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/oath/petition", { method: "POST" });
      if (!res.ok) throw new Error("failed");
      closeConfirm();
      router.refresh(); // You re-renders into the "petitioned" state
    } catch {
      setSending(false);
    }
  }

  // ── Collared: the ceremonial oath plate — collar art backdrop, the gold
  //    light breathing around the whole plate (D5). ──
  if (state === "collared") {
    return (
      <div className="breathes relative mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-gold/40 bg-surface-raised text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={COLLAR_ART}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, var(--color-bg), color-mix(in srgb, var(--color-bg) 55%, transparent))",
          }}
        />
        <div className="relative px-6 py-9">
          <span
            aria-hidden
            className="glow-gold mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/50 bg-bg/40 text-gold backdrop-blur-sm"
          >
            <IconCollar size={26} />
          </span>
          <Display as="h2" className="mt-4 text-3xl text-gold">
            {sinceLabel
              ? fill(copy.oath.collaredSince, { date: sinceLabel })
              : copy.oath.collaredMark}
          </Display>
          <Ornament className="mx-auto mt-3 w-28" />
          <Whisper className="mt-3 text-text/85">
            {copy.oath.collaredLead}
          </Whisper>
        </div>
      </div>
    );
  }

  // ── Petitioned: the wait ──
  if (state === "petitioned") {
    return (
      <Card className="mt-6">
        <Label>{copy.oath.title}</Label>
        <Display as="h2" className="mt-2 text-xl">
          {copy.oath.considering}
        </Display>
        <Whisper className="mt-2">{copy.oath.consideringLead}</Whisper>
      </Card>
    );
  }

  // ── Eligible: the petition unseals ──
  if (state === "eligible") {
    return (
      <>
        <Card raised className="mt-6 border-gold/30">
          <Label>{copy.oath.title}</Label>
          <Whisper className="mt-2 font-[family-name:var(--font-display)] text-base italic">
            {copy.oath.eligibleLead}
          </Whisper>
          <div className="mt-4">
            <Button variant="gold" onClick={openConfirm}>
              {copy.oath.petition}
            </Button>
          </div>
        </Card>

        {confirming ? (
          <div
            role="dialog"
            aria-modal="true"
            className={`fixed inset-0 z-[100] flex items-center justify-center px-6 text-center transition-opacity duration-[var(--dur-slow)] ${
              visible ? "opacity-100" : "opacity-0"
            }`}
          >
            <button
              aria-label={copy.oath.confirmCancel}
              onClick={closeConfirm}
              className="absolute inset-0 -z-10 bg-bg/95 backdrop-blur-md"
            />
            <div
              aria-hidden
              className="motion-safe:breathe pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(55% 45% at 50% 45%, var(--color-accent-soft) 0%, transparent 72%)",
              }}
            />
            <div className="max-w-sm">
              <span
                aria-hidden
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 text-gold [text-shadow:0_0_40px_rgba(212,175,106,0.35)]"
              >
                <IconCollar size={28} />
              </span>
              <Display as="h2" className="mt-6 text-[1.9rem] leading-tight">
                {copy.oath.confirmTitle}
              </Display>
              <Ornament className="mx-auto mt-4 w-28" />
              <Whisper className="mt-4">{copy.oath.confirmBody}</Whisper>
              <div className="mt-8 flex flex-col items-center gap-3">
                <Button
                  variant="gold"
                  size="lg"
                  loading={sending}
                  disabled={sending}
                  onClick={petition}
                >
                  {sending ? copy.oath.petitioning : copy.oath.confirmAction}
                </Button>
                <Button variant="ghost" onClick={closeConfirm} disabled={sending}>
                  {copy.oath.confirmCancel}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  // ── Sealed: not earned yet ──
  return (
    <Card className="mt-6 border-dashed border-line/70">
      <Label>{copy.oath.title}</Label>
      <div className="mt-3 flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-text-dim/70"
        >
          <IconCollar size={18} />
        </span>
        <div>
          <Whisper className="font-[family-name:var(--font-display)] text-base italic text-text">
            {copy.oath.sealedLead}
          </Whisper>
          <Whisper className="mt-1 text-xs">
            {fill(copy.oath.sealed, { n: minStreak, have: currentStreak })}
          </Whisper>
        </div>
      </div>
    </Card>
  );
}
