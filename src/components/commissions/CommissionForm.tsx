"use client";

import { useState } from "react";
import type { CommissionField } from "@/lib/commissions/form";
import { Button, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * The commission request form (F04). Two shapes:
 *  - "full"     — the field form, shown only when commissions are open AND the
 *                 subject has nothing already in her hands.
 *  - "waitlist" — a single "Add me to the waitlist" petition, shown when sealed.
 * A duplicate active request is refused server-side and surfaced in her voice.
 */
export function CommissionForm({
  fields,
  variant,
}: {
  fields: CommissionField[];
  variant: "full" | "waitlist";
}) {
  const open = variant === "full";
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function set(id: string, v: string) {
    setAnswers((a) => ({ ...a, [id]: v }));
  }

  async function submit() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) {
        setState("done");
      } else if (res.status === 409) {
        setState("idle");
        setError(copy.comm.oneAtATime);
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
        {open ? copy.comm.submitted : copy.comm.waitlisted}
      </p>
    );
  }

  // Sealed: a single waitlist petition, no fields.
  if (variant === "waitlist") {
    return (
      <div className="mt-8 space-y-4">
        <Whisper>{copy.comm.waitlistWhisper}</Whisper>
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
      {fields.map((f) => (
        <div key={f.id}>
          <label className="mb-1 block text-sm text-text">
            {f.label}
            {f.required ? <span className="text-danger"> *</span> : null}
          </label>
          {f.type === "long" ? (
            <textarea
              rows={3}
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
      <Whisper className="text-xs">
        Payment is arranged in her reply if she accepts.
      </Whisper>
    </div>
  );
}
