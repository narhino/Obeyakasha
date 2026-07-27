/**
 * The automation trigger catalogue. PURE — no DB, no push, no Node built-ins —
 * so the Sanctum's client-side editor can import it without dragging the
 * server's web-push stack into the browser bundle.
 *
 * A trigger is a moment the worker can actually detect. This list is the honest
 * boundary of what she can automate: she owns every word, audience and timing
 * of an automation, but the moment it fires on has to exist in code. The editor
 * says so rather than offering a free-text field that would never fire.
 */

export interface TriggerSpec {
  key: string;
  /** What she sees in the Sanctum. */
  label: string;
  /** Exactly when it fires, said plainly — no marketing. */
  when: string;
  /** The tunable, if it has one. */
  param?: { key: string; label: string; min: number; max: number; unit: string };
  /** Where the notification should land by default. */
  defaultLink: string;
}

export const TRIGGERS: TriggerSpec[] = [
  {
    key: "inactive_days",
    label: "They went quiet",
    when: "Fires once when a subject's last listen was this many days ago.",
    param: { key: "days", label: "Days of silence", min: 2, max: 60, unit: "days" },
    defaultLink: "/library",
  },
  {
    key: "chain_broken",
    label: "Their chain broke",
    when: "Fires the day after a subject drops a chain they'd held at least 3 days.",
    defaultLink: "/me",
  },
  {
    key: "anniversary",
    label: "A year since they knelt",
    when: "Fires on the anniversary of the day they were claimed.",
    defaultLink: "/me",
  },
  {
    key: "lapse",
    label: "Their access sealed",
    when: "Fires the day a subject's entitlement goes frozen — the pledge stopped covering them.",
    defaultLink: "/library",
  },
];

export function triggerSpec(key: string): TriggerSpec | undefined {
  return TRIGGERS.find((t) => t.key === key);
}
