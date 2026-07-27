"use client";

import { useActionState, useState } from "react";
import { Button, Input, Select, Whisper } from "@/components/ui";
import { TRIGGERS } from "@/lib/automations/triggers";
import type { Audience } from "@/lib/db/schema/relationship";
import { saveAutomation, type AutomationFormState } from "./actions";

export interface ExistingAutomation {
  id: string;
  trigger: string;
  label: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  days: number | null;
  audience: Audience;
  respectQuietHours: boolean;
  enabled: boolean;
}

/**
 * One automation, whole. Creating and editing are the same form — the only
 * difference is whether an id rides along — so there is exactly one place where
 * what an automation says is decided.
 *
 * The trigger picker names the moment in plain words and states, underneath,
 * exactly when it fires. Every automation on this platform is a message that
 * arrives at someone unbidden; she should never have to guess what she is
 * agreeing to send.
 */
export function AutomationEditor({
  existing,
}: {
  existing?: ExistingAutomation;
}) {
  const [state, formAction, pending] = useActionState<
    AutomationFormState,
    FormData
  >(saveAutomation, {});

  const [trigger, setTrigger] = useState(existing?.trigger ?? TRIGGERS[0]!.key);
  const [audienceType, setAudienceType] = useState<string>(
    existing?.audience?.type === "level"
      ? "level"
      : existing?.audience?.type === "oath"
        ? "oath"
        : "all",
  );
  const [enabled, setEnabled] = useState(existing?.enabled ?? false);
  const [quiet, setQuiet] = useState(existing?.respectQuietHours ?? true);
  const spec = TRIGGERS.find((t) => t.key === trigger) ?? TRIGGERS[0]!;

  return (
    <form action={formAction} className="space-y-3">
      {existing ? <input type="hidden" name="id" value={existing.id} /> : null}

      <label className="flex flex-col gap-1 text-xs text-text-dim">
        When it fires
        <Select
          name="trigger"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
        >
          {TRIGGERS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </Select>
        <span className="text-text-dim/70">{spec.when}</span>
      </label>

      {spec.param ? (
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          {spec.param.label}
          <Input
            name="days"
            type="number"
            min={spec.param.min}
            max={spec.param.max}
            defaultValue={existing?.days ?? 5}
            className="w-28"
          />
        </label>
      ) : null}

      <label className="flex flex-col gap-1 text-xs text-text-dim">
        Your name for it (never sent)
        <Input
          name="label"
          maxLength={80}
          required
          defaultValue={existing?.label ?? spec.label}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-text-dim">
        What the notification says
        <Input
          name="title"
          maxLength={120}
          required
          placeholder="You slipped."
          defaultValue={existing?.title ?? ""}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-text-dim">
        The line beneath it
        <Input
          name="body"
          maxLength={300}
          placeholder="The chain slackened. Come back down to me."
          defaultValue={existing?.body ?? ""}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Where it opens
          <Input
            name="deepLink"
            maxLength={200}
            placeholder={spec.defaultLink}
            defaultValue={existing?.deepLink ?? spec.defaultLink}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Who it may reach
          <Select
            name="audienceType"
            value={audienceType}
            onChange={(e) => setAudienceType(e.target.value)}
          >
            <option value="all">Anyone the trigger catches</option>
            <option value="level">Only at or above a level</option>
            <option value="oath">Only the Collared</option>
          </Select>
        </label>
      </div>

      {audienceType === "level" ? (
        <label className="flex items-center gap-2 text-xs text-text-dim">
          Level at least
          <Input
            name="level"
            type="number"
            min={0}
            max={99}
            defaultValue={
              existing?.audience?.type === "level" ? existing.audience.level : 1
            }
            className="w-20"
          />
        </label>
      ) : null}

      {/* Both switches post through hidden inputs. An unchecked checkbox sends
          NOTHING, so a bare checkbox cannot express "no" — quiet hours in
          particular would have been impossible to turn off, silently. */}
      <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />
      <input
        type="hidden"
        name="respectQuietHours"
        value={quiet ? "true" : "false"}
      />
      <div className="flex flex-wrap items-center gap-5">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-dim">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-gold)]"
          />
          Let it speak
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-dim">
          <input
            type="checkbox"
            checked={quiet}
            onChange={(e) => setQuiet(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-gold)]"
          />
          Hold it during their quiet hours
        </label>
      </div>

      {state?.error ? (
        <Whisper className="text-danger">{state.error}</Whisper>
      ) : null}
      {state?.ok ? (
        <Whisper className="text-gold">Set. It behaves as you said.</Whisper>
      ) : null}

      <Button type="submit" variant="gold" size="sm" loading={pending}>
        {existing ? "Save it" : "Add it"}
      </Button>
    </form>
  );
}
