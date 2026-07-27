/**
 * F4 — the threshold decision. The full experience lives on the home screen with
 * her voice allowed through; on mobile that is not optional. This pure function
 * decides whether a subject is held at the threshold and, if so, at which step.
 * No DOM, no I/O — the component feeds it live inputs and renders the result.
 *
 * Rules:
 *  - Only mobile subjects are held by the THRESHOLD (install + permission).
 *    Desktop and the goddess pass those always; proof is asked of everyone.
 *  - Not installed to the home screen → held at "install".
 *  - Installed but push not granted (and push IS supported) → held at "notifications".
 *  - Push "unsupported" (e.g. iOS below 16.4) with the app installed → NOT held.
 *    Fail-open by design: we will not lock out a device that physically cannot
 *    accept web push once it has done the one thing it can (add to home screen).
 *  - `proofOwed` → held at "reverify", on EVERY platform including desktop.
 *    This is the one demand that isn't about phones: the browser reporting
 *    "granted" was never evidence that anything arrives, and a whole membership
 *    sat behind that false green light receiving nothing. Proof means one real
 *    push, observed landing. It is checked LAST, so a device that still owes
 *    install or permission is asked for those first — you cannot prove delivery
 *    to a device that hasn't allowed it yet.
 */

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

export interface JailInputs {
  isMobile: boolean;
  isStandalone: boolean;
  pushPermission: PushPermission;
  jailEnabled: boolean;
  /**
   * The server's verdict: she has demanded fresh proof and this device has none
   * that still counts. Independent of `jailEnabled` — turning the mobile
   * threshold off does not mean she stopped needing to reach people.
   */
  proofOwed: boolean;
}

export type JailStep = "install" | "notifications" | "reverify";

export interface JailResult {
  jailed: boolean;
  step: JailStep | null;
}

const FREE: JailResult = { jailed: false, step: null };

export function jail(inputs: JailInputs): JailResult {
  const { isMobile, isStandalone, pushPermission, jailEnabled, proofOwed } =
    inputs;

  // A device that physically cannot carry push is never held for push — not
  // for permission, and not for proof. Fail-open, checked before everything
  // that could ask the impossible of it.
  if (pushPermission === "unsupported") {
    if (jailEnabled && isMobile && !isStandalone)
      return { jailed: true, step: "install" };
    return FREE;
  }

  // The mobile threshold, exactly as before.
  if (jailEnabled && isMobile) {
    if (!isStandalone) return { jailed: true, step: "install" };
    if (pushPermission !== "granted")
      return { jailed: true, step: "notifications" };
  }

  // Last: proof. Every platform, whether or not the mobile threshold is on.
  if (proofOwed) return { jailed: true, step: "reverify" };

  return FREE;
}
