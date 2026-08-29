import { describe, expect, it } from "vitest";
import { jail, type JailInputs, type PushPermission } from "./jail";

function inputs(partial: Partial<JailInputs>): JailInputs {
  return {
    isMobile: true,
    isStandalone: true,
    pushPermission: "granted",
    jailEnabled: true,
    proofOwed: false,
    exempt: false,
    ...partial,
  };
}

const PERMS: PushPermission[] = ["granted", "denied", "default", "unsupported"];

describe("jail — the threshold decision matrix", () => {
  it("feature off → never held, whatever the device", () => {
    for (const isStandalone of [true, false]) {
      for (const pushPermission of PERMS) {
        const r = jail(
          inputs({ jailEnabled: false, isStandalone, pushPermission }),
        );
        expect(r).toEqual({ jailed: false, step: null });
      }
    }
  });

  it("desktop → never held (even not-installed, even without push)", () => {
    for (const pushPermission of PERMS) {
      const r = jail(
        inputs({ isMobile: false, isStandalone: false, pushPermission }),
      );
      expect(r).toEqual({ jailed: false, step: null });
    }
  });

  it("mobile, not standalone → held at install (regardless of push)", () => {
    for (const pushPermission of PERMS) {
      const r = jail(inputs({ isStandalone: false, pushPermission }));
      expect(r).toEqual({ jailed: true, step: "install" });
    }
  });

  it("mobile, standalone, push not granted (supported) → held at notifications", () => {
    for (const pushPermission of ["denied", "default"] as PushPermission[]) {
      const r = jail(inputs({ isStandalone: true, pushPermission }));
      expect(r).toEqual({ jailed: true, step: "notifications" });
    }
  });

  it("mobile, standalone, push granted → free", () => {
    const r = jail(inputs({ isStandalone: true, pushPermission: "granted" }));
    expect(r).toEqual({ jailed: false, step: null });
  });

  it("mobile, standalone, push UNSUPPORTED → free (fail-open, old iOS)", () => {
    const r = jail(inputs({ isStandalone: true, pushPermission: "unsupported" }));
    expect(r).toEqual({ jailed: false, step: null });
  });

  it("unsupported push while NOT standalone still demands install first", () => {
    const r = jail(inputs({ isStandalone: false, pushPermission: "unsupported" }));
    expect(r).toEqual({ jailed: true, step: "install" });
  });
});

describe("jail — proof of delivery", () => {
  it("owed proof holds a PHONE at reverify", () => {
    const r = jail(inputs({ isMobile: true, proofOwed: true }));
    expect(r).toEqual({ jailed: true, step: "reverify" });
  });

  it("a laptop is NEVER walled — not for proof, not for anything", () => {
    // A browser that has denied notifications cannot be re-prompted by script,
    // so a desktop wall is a lockout with no way out. Notifications there are
    // an invitation (DesktopInvite), never a demand.
    for (const pushPermission of PERMS) {
      for (const isStandalone of [true, false]) {
        expect(
          jail(
            inputs({
              isMobile: false,
              proofOwed: true,
              pushPermission,
              isStandalone,
            }),
          ),
        ).toEqual({ jailed: false, step: null });
      }
    }
  });

  it("owed proof holds even when the mobile threshold is off", () => {
    const r = jail(inputs({ jailEnabled: false, proofOwed: true }));
    expect(r).toEqual({ jailed: true, step: "reverify" });
  });

  it("install and permission are asked BEFORE proof", () => {
    expect(jail(inputs({ isStandalone: false, proofOwed: true }))).toEqual({
      jailed: true,
      step: "install",
    });
    expect(
      jail(inputs({ pushPermission: "default", proofOwed: true })),
    ).toEqual({ jailed: true, step: "notifications" });
  });

  it("a device that cannot carry push is never asked to prove it", () => {
    for (const isMobile of [true, false]) {
      const r = jail(
        inputs({ isMobile, pushPermission: "unsupported", proofOwed: true }),
      );
      expect(r).toEqual({ jailed: false, step: null });
    }
  });

  it("no proof owed → free, as before", () => {
    expect(jail(inputs({ proofOwed: false }))).toEqual({
      jailed: false,
      step: null,
    });
  });
});

describe("jail — her per-subject release", () => {
  it("exempt frees them whatever else is owed", () => {
    for (const pushPermission of PERMS) {
      for (const isStandalone of [true, false]) {
        expect(
          jail(
            inputs({
              exempt: true,
              proofOwed: true,
              isStandalone,
              pushPermission,
            }),
          ),
        ).toEqual({ jailed: false, step: null });
      }
    }
  });

  it("not exempt still behaves exactly as before", () => {
    expect(jail(inputs({ exempt: false, isStandalone: false }))).toEqual({
      jailed: true,
      step: "install",
    });
  });
});

describe("the wall must never be a dead end", () => {
  it("holds a phone that has refused notifications — which is exactly why a way out is needed", () => {
    // A browser that has denied notifications cannot be re-prompted by any
    // script. Without an escape hatch this member is locked out permanently.
    const r = jail({
      isMobile: true,
      isStandalone: true,
      pushPermission: "denied",
      jailEnabled: true,
      proofOwed: false,
      exempt: false,
    });
    expect(r).toEqual({ jailed: true, step: "notifications" });
  });

  it("lets her release that same person in one move", () => {
    // The release she can already toggle from their profile has to beat every
    // other rule, or the escape hatch leads nowhere.
    expect(
      jail({
        isMobile: true,
        isStandalone: false,
        pushPermission: "denied",
        jailEnabled: true,
        proofOwed: true,
        exempt: true,
      }),
    ).toEqual({ jailed: false, step: null });
  });
});
