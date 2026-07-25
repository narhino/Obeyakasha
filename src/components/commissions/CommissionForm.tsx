"use client";

import { useState } from "react";
import type { CommissionField } from "@/lib/commissions/form";
import { Button, Input, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * The commission request form (F04). Two shapes:
 *  - "full"     — the field form, shown only when commissions are open AND the
 *                 subject has nothing already in her hands.
 *  - "waitlist" — a single "Add me to the waitlist" petition, shown when sealed.
 * A duplicate active request is refused server-side and surfaced in her voice.
 *
 * `guest` (R-anon) adds the one thing a stranger must give her — an address to
 * answer at — plus an optional name, to BOTH shapes: a waitlisted stranger she
 * cannot call is a stranger she has lost. Signed-in submission is untouched; the
 * email is never sent, and the server ignores it when a session exists.
 */
export function CommissionForm({
  fields,
  variant,
  guest = false,
}: {
  fields: CommissionField[];
  variant: "full" | "waitlist";
  guest?: boolean;
}) {
  const open = variant === "full";
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function set(id: string, v: string) {
    setAnswers((a) => ({ ...a, [id]: v }));
  }

  async function submit() {
    if (guest && email.trim() === "") {
      setError(copy.comm.guest.emailMissing);
      return;
    }
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          guest
            ? { answers, email: email.trim(), name: name.trim() || undefined }
            : { answers },
        ),
      });
      if (res.ok) {
        setState("done");
      } else if (res.status === 409) {
        setState("idle");
        setError(copy.comm.oneAtATime);
      } else if (res.status === 429) {
        setState("idle");
        setError(copy.comm.guest.tooMany);
      } else {
        setState("idle");
        setError(copy.system.genericHold);
      }
    } catch {
      setState("idle");
      setError(copy.system.genericHold);
    }
  }

  if (state === "done") {
    return (
      <p className="mt-8 text-gold">
        {guest
          ? open
            ? copy.comm.guest.submitted
            : copy.comm.guest.waitlisted
          : open
            ? copy.comm.submitted
            : copy.comm.waitlisted}
      </p>
    );
  }

  // The stranger's reply address (+ what to call them). Rendered above whatever
  // shape follows, because it is the part without which nothing else matters.
  const identity = guest ? (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="guest-email"
          className="mb-1 block text-sm text-text"
        >
          {copy.comm.guest.emailLabel}
          <span className="text-danger"> *</span>
        </label>
        <Input
          id="guest-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={copy.comm.guest.emailPlaceholder}
          className="w-full"
        />
        <Whisper className="mt-1 text-xs">{copy.comm.guest.emailHint}</Whisper>
      </div>
      <div>
        <label htmlFor="guest-name" className="mb-1 block text-sm text-text">
          {copy.comm.guest.nameLabel}
        </label>
        <Input
          id="guest-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={copy.comm.guest.namePlaceholder}
          className="w-full"
        />
      </div>
    </div>
  ) : null;

  // Sealed: a single waitlist petition, no fields (a guest still leaves an
  // address — otherwise there is no one to call when a slot opens).
  if (variant === "waitlist") {
    return (
      <div className="mt-8 space-y-4">
        <Whisper>{copy.comm.waitlistWhisper}</Whisper>
        {identity}
        {error ? <Whisper className="text-danger">{error}</Whisper> : null}
        <Button
          variant="gold"
          size="lg"
          disabled={state === "sending"}
          loading={state === "sending"}
          onClick={submit}
        >
          {copy.comm.waitlistJoin}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      {identity}
      {fields.map((f) => (
        <div key={f.id}>
          <label className="mb-1 block text-sm text-text">
            {f.label}
            {f.required ? <span className="text-danger"> *</span> : null}
          </label>
          {f.type === "long" ? (
            <textarea
              rows={3}
              maxLength={4000}
              value={answers[f.id] ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text focus:border-gold focus:outline-none"
            />
          ) : f.type === "choice" ? (
            <select
              value={answers[f.id] ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text focus:border-gold focus:outline-none"
            >
              <option value="">—</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              maxLength={4000}
              value={answers[f.id] ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text focus:border-gold focus:outline-none"
            />
          )}
        </div>
      ))}
      {error ? <Whisper className="text-danger">{error}</Whisper> : null}
      <Button
        variant="gold"
        size="lg"
        disabled={state === "sending"}
        loading={state === "sending"}
        onClick={submit}
      >
        {copy.comm.submit}
      </Button>
      <Whisper className="text-xs">{copy.comm.payment}</Whisper>
    </div>
  );
}
