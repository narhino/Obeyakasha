"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * The two-tap destructive control for the Sanctum (tracks, series, trainings).
 * A quiet resting "Delete" arms into an inline, irreversible confirm — the warn
 * line + "Delete forever" / "Keep it" — with NO browser confirm(). Tokens only,
 * danger tone. Copy is hers (`copy.sanctum.delete`), passed a per-thing `warn`.
 *
 * `action` is a server action (a track/series/program delete); `fields` are the
 * hidden inputs it reads from FormData. On success the enclosing row typically
 * unmounts (revalidated server card, or an optimistic removal via `onDone`), so
 * there's nothing to reset. On failure it stays armed so she can try again.
 */
export function ConfirmDelete({
  action,
  fields,
  warn,
  onDone,
  className = "",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  warn: string;
  onDone?: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);

  if (!armed) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setArmed(true)}
        className={className}
      >
        {copy.sanctum.delete.action}
      </Button>
    );
  }

  const confirm = async () => {
    setPending(true);
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    try {
      await action(fd);
      onDone?.();
      // Success: this control unmounts with its row. Nothing to reset.
    } catch {
      setPending(false); // keep it armed — let her try again
    }
  };

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-2 ${className}`}
      role="alertdialog"
      aria-label={warn}
    >
      <span className="text-xs text-danger">{warn}</span>
      <Button
        type="button"
        size="sm"
        variant="danger"
        loading={pending}
        onClick={confirm}
      >
        {pending ? copy.sanctum.delete.working : copy.sanctum.delete.forever}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => setArmed(false)}
      >
        {copy.sanctum.delete.cancel}
      </Button>
    </span>
  );
}
