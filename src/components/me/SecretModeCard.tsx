"use client";

import { useState, useTransition } from "react";
import { Card, Label, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";
import { setDisguiseMode } from "@/lib/profile/secret";
import { DISGUISE_MESSAGES } from "@/lib/push/disguise";
import { Switch } from "./Switch";
import { NotificationPreview } from "./NotificationPreview";

/**
 * Secret mode toggle for the top of the You page. Impossible to miss: a framed
 * "Discretion" card with an on/off switch and a live side-by-side preview of a
 * normal (her voice) vs disguised notification, so the choice is obvious. The
 * switch writes users.disguiseMode through the shared own-user server action.
 */
export function SecretModeCard({ initialOn }: { initialOn: boolean }) {
  const [on, setOn] = useState(initialOn);
  const [pending, startTransition] = useTransition();
  // A representative disguised example for the mock (the real pool rotates).
  const sample = DISGUISE_MESSAGES[0]!;

  function toggle(next: boolean) {
    setOn(next); // optimistic
    startTransition(async () => {
      try {
        await setDisguiseMode(next);
      } catch {
        setOn(!next); // revert if the write failed
      }
    });
  }

  return (
    <Card raised className="border-gold/25">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label className="text-gold">{copy.secret.title}</Label>
          <Whisper className="mt-2">{copy.secret.body}</Whisper>
        </div>
        <Switch
          checked={on}
          onChange={toggle}
          disabled={pending}
          label={copy.secret.toggleLabel}
        />
      </div>

      <p className="mt-3 text-xs text-text-dim/80">
        {on ? copy.secret.whenOn : copy.secret.whenOff}
      </p>
      {/* F5: the choice is never final — say so where the switch lives. */}
      <Whisper className="mt-2 text-xs">{copy.secret.anytime}</Whisper>

      <p className="label-caps mt-5 text-[0.625rem]">{copy.secret.previewIntro}</p>
      <div className="mt-2 flex gap-3">
        <NotificationPreview
          variant="true"
          label={copy.secret.previewTrueLabel}
          title={copy.secret.previewTrueTitle}
          body={copy.secret.previewTrueBody}
        />
        <NotificationPreview
          variant="mask"
          label={copy.secret.previewMaskLabel}
          title={sample.title}
          body={sample.body}
        />
      </div>

      <Whisper className="mt-4 text-xs">{copy.secret.reinstallHint}</Whisper>
    </Card>
  );
}
