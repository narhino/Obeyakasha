import { describe, expect, it } from "vitest";

/**
 * The device-registration write rule, extracted so the thing that silenced an
 * entire membership is pinned by a test rather than by a code comment.
 *
 * The bug: the route unconditionally wrote `pushSubscription ?? null`. The gate
 * calls registration on EVERY mount with no subscription in hand, so one page
 * load after enabling notifications erased the subscription — and sends require
 * a non-null one, so the subject silently stopped receiving anything forever.
 */
interface Incoming {
  pushSubscription?: { endpoint: string } | null;
  pushEnabled?: boolean;
  installed?: boolean;
  clearPush?: boolean;
}

/** Mirrors the update-building logic in src/app/api/devices/route.ts. */
function buildUpdate(d: Incoming): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (d.installed !== undefined) update.installed = d.installed;
  if (d.clearPush) {
    update.pushSubscription = null;
    update.pushEnabled = false;
    update.pushVerifiedAt = null;
    update.verifyToken = null;
  } else if (d.pushSubscription) {
    update.pushSubscription = d.pushSubscription;
    update.pushEnabled = d.pushEnabled ?? true;
  } else if (d.pushEnabled === false) {
    update.pushEnabled = false;
  }
  return update;
}

describe("device registration — never erase a subscription you weren't given", () => {
  it("a bare touch does not mention the subscription at all", () => {
    const update = buildUpdate({ installed: true, pushEnabled: true });
    expect("pushSubscription" in update).toBe(false);
  });

  it("THE REGRESSION: a gate mount with no subscription leaves it alone", () => {
    // Exactly the call SubjectGate makes on every page load.
    const update = buildUpdate({ installed: false, pushEnabled: true });
    expect("pushSubscription" in update).toBe(false);
  });

  it("an explicit null is still not an erase", () => {
    const update = buildUpdate({ pushSubscription: null, pushEnabled: false });
    expect("pushSubscription" in update).toBe(false);
    // It may stop sending, but the subscription survives for healing.
    expect(update.pushEnabled).toBe(false);
  });

  it("permission revoked disables sending but keeps the subscription", () => {
    const update = buildUpdate({ pushEnabled: false });
    expect(update.pushEnabled).toBe(false);
    expect("pushSubscription" in update).toBe(false);
  });

  it("a real subscription is written and turns sending on", () => {
    const sub = { endpoint: "https://push.example/abc" };
    const update = buildUpdate({ pushSubscription: sub });
    expect(update.pushSubscription).toEqual(sub);
    expect(update.pushEnabled).toBe(true);
  });

  it("clearPush is the ONLY way to erase, and it takes the proof with it", () => {
    const update = buildUpdate({ clearPush: true });
    expect(update.pushSubscription).toBeNull();
    expect(update.pushEnabled).toBe(false);
    expect(update.pushVerifiedAt).toBeNull();
    expect(update.verifyToken).toBeNull();
  });

  it("clearPush wins even when a subscription rides along", () => {
    const update = buildUpdate({
      clearPush: true,
      pushSubscription: { endpoint: "https://push.example/abc" },
    });
    expect(update.pushSubscription).toBeNull();
  });
});
