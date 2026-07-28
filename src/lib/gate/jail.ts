/**
 * F4 — the threshold decision. The full experience lives on the home screen with
 * her voice allowed through; on a phone that is not optional. This pure function
 * decides whether a subject is held at the threshold and, if so, at which step.
 * No DOM, no I/O — the component feeds it live inputs and renders the result.
 *
 * Rules:
 *  - ONLY phones are ever held. A laptop or desktop is never walled — not for
 *    install, not for notifications, not for proof. Notifications there are an
 *    invitation, not a demand: a browser that has already denied them cannot be
 *    re-prompted by script, so a wall on desktop is a lockout with no way out.
 *    Desktop gets `DesktopInvite`, a separate dismissible card that never blocks.
 *  - Not installed to the home screen → held at "install".
 *  - Installed but push not granted (and push IS supported) → held at
 *    "notifications".
 *  - Push "unsupported" (e.g. iOS below 16.4) → NEVER held for push. Fail-open
 *    by design: we will not lock out a device that physically cannot accept web
 *    push once it has done the one thing it can (add to home screen).
 *  - `proofOwed` → held at "reverify". Checked LAST, because you cannot prove
 *    delivery to a device that has not allowed it yet.
 *  - `exempt` → she released THIS subject from the requirement on THIS kind of
 *    device, from their profile. Beats everything.
 */

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

export interface JailInputs {
  isMobile: boolean;
  isStandalone: boolean;
  pushPermission: PushPermission;
  jailEnabled: boolean;
  /**
   * The server's verdict: she has demanded fresh proof and this device has none
   * that still counts. Independent of `jailEnabled` — turning the threshold off
   * does not mean she stopped needing to reach people.
   */
  proofOwed: boolean;
  /** She released this subject from the requirement on this kind of device. */
  exempt: boolean;
}

export type JailStep = "install" | "notifications" | "reverify";

export interface JailResult {
  jailed: boolean;
  step: JailStep | null;
}

const FREE: JailResult = { jailed: false, step: null };

export function jail(inputs: JailInputs): JailResult {
  const {
    isMobile,
    isStandalone,
    pushPermission,
    jailEnabled,
    proofOwed,
    exempt,
  } = inputs;

  // Released by her, or not a phone → nothing is ever demanded here.
  if (exempt) return FREE;
  if (!isMobile) return FREE;

  // A device that cannot physically carry push is never held for push — not for
  // permission, not for proof. The install step still stands: that it CAN do.
  if (pushPermission === "unsupported") {
    if (jailEnabled && !isStandalone) return { jailed: true, step: "install" };
    return FREE;
  }

  if (jailEnabled) {
    if (!isStandalone) return { jailed: true, step: "install" };
    if (pushPermission !== "granted")
      return { jailed: true, step: "notifications" };
  }

  // Last: proof that a notification actually lands on this device.
  if (proofOwed) return { jailed: true, step: "reverify" };

  return FREE;
}
