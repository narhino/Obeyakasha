/**
 * F4 — the threshold decision. The full experience lives on the home screen with
 * her voice allowed through; on mobile that is not optional. This pure function
 * decides whether a subject is held at the threshold and, if so, at which step.
 * No DOM, no I/O — the component feeds it live inputs and renders the result.
 *
 * Rules:
 *  - Only mobile subjects are ever held. Desktop and the goddess pass always.
 *  - Not installed to the home screen → held at "install".
 *  - Installed but push not granted (and push IS supported) → held at "notifications".
 *  - Push "unsupported" (e.g. iOS below 16.4) with the app installed → NOT held.
 *    Fail-open by design: we will not lock out a device that physically cannot
 *    accept web push once it has done the one thing it can (add to home screen).
 */

export type PushPermission = "granted" | "denied" | "default" | "unsupported";

export interface JailInputs {
  isMobile: boolean;
  isStandalone: boolean;
  pushPermission: PushPermission;
  jailEnabled: boolean;
}

export type JailStep = "install" | "notifications";

export interface JailResult {
  jailed: boolean;
  step: JailStep | null;
}

const FREE: JailResult = { jailed: false, step: null };

export function jail(inputs: JailInputs): JailResult {
  const { isMobile, isStandalone, pushPermission, jailEnabled } = inputs;

  // The goddess turned it off, or this isn't a phone → the threshold is open.
  if (!jailEnabled) return FREE;
  if (!isMobile) return FREE;

  // First demand: I live on your home screen, not in a tab.
  if (!isStandalone) return { jailed: true, step: "install" };

  // Installed. Second demand: my voice reaches you — unless the device can't
  // physically carry push, in which case installing is all we can ask (fail-open).
  if (pushPermission === "unsupported") return FREE;
  if (pushPermission !== "granted") return { jailed: true, step: "notifications" };

  return FREE;
}
