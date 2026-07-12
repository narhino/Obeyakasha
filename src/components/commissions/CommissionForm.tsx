"use client";

import { useState } from "react";
import type { CommissionField } from "@/lib/commissions/form";
import { Button, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

export function CommissionForm({
  fields,
  open,
}: {
  fields: CommissionField[];
  open: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  function set(id: string, v: string) {
    setAnswers((a) => ({ ...a, [id]: v }));
  }

  async function submit() {
    setState("sending");
    try {
      const res = await fetch("/api/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) setState("done");
      else setState("idle");
    } catch {
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <p className="mt-8 text-gold">
        {open ? copy.comm.submitted : "You're on the waitlist. Wait to be called."}
      </p>
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
      <Button variant="gold" size="lg" disabled={state === "sending"} onClick={submit}>
        {open ? copy.comm.submit : copy.comm.waitlistJoin}
      </Button>
      <Whisper className="text-xs">
        Payment is arranged in her reply if she accepts.
      </Whisper>
    </div>
  );
}
