import { describe, expect, it } from "vitest";
import { jail, type JailInputs, type PushPermission } from "./jail";

function inputs(partial: Partial<JailInputs>): JailInputs {
  return {
    isMobile: true,
    isStandalone: true,
    pushPermission: "granted",
    jailEnabled: true,
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
