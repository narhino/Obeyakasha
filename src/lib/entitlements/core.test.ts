import { describe, expect, it } from "vitest";
import {
  canAccess,
  DEFAULT_MAPPED_LEVEL,
  effectiveAccess,
  type EntitlementInputs,
  THRESHOLD_LEVEL,
} from "./core";

const mappings = [
  { patreonTierId: "tier_bronze", accessLevel: 1 },
  { patreonTierId: "tier_silver", accessLevel: 2 },
  { patreonTierId: "tier_gold", accessLevel: 3 },
];

function inputs(partial: Partial<EntitlementInputs>): EntitlementInputs {
  return { mappings, ...partial };
}

describe("effectiveAccess — Patreon tiers", () => {
  it("no patreon, no grants → threshold level 0", () => {
    const r = effectiveAccess(inputs({}));
    expect(r.accessLevel).toBe(THRESHOLD_LEVEL);
    expect(r.inGrace).toBe(false);
    expect(r.frozen).toBe(false);
  });

  it("single active tier → its mapped level", () => {
    const r = effectiveAccess(
      inputs({
        patreon: { entitledTierIds: ["tier_silver"], status: "active" },
      }),
    );
    expect(r.accessLevel).toBe(2);
  });

  it("multiple tiers → the MAX mapped level", () => {
    const r = effectiveAccess(
      inputs({
        patreon: {
          entitledTierIds: ["tier_bronze", "tier_gold", "tier_silver"],
          status: "active",
        },
      }),
    );
    expect(r.accessLevel).toBe(3);
  });

  it("unmapped tier → default mapped level + reported as unmapped", () => {
    const r = effectiveAccess(
      inputs({
        patreon: { entitledTierIds: ["tier_unknown"], status: "active" },
      }),
    );
    expect(r.accessLevel).toBe(DEFAULT_MAPPED_LEVEL);
    expect(r.unmappedTierIds).toEqual(["tier_unknown"]);
  });

  it("mix of mapped + unmapped → max wins, unmapped still reported", () => {
    const r = effectiveAccess(
      inputs({
        patreon: {
          entitledTierIds: ["tier_gold", "tier_unknown"],
          status: "active",
        },
      }),
    );
    expect(r.accessLevel).toBe(3);
    expect(r.unmappedTierIds).toEqual(["tier_unknown"]);
  });
});

describe("effectiveAccess — grace", () => {
  it("grace keeps full access and flags inGrace", () => {
    const r = effectiveAccess(
      inputs({
        patreon: { entitledTierIds: ["tier_gold"], status: "grace" },
      }),
    );
    expect(r.accessLevel).toBe(3);
    expect(r.inGrace).toBe(true);
    expect(r.frozen).toBe(false);
  });
});

describe("effectiveAccess — frozen", () => {
  it("frozen patreon seals access to threshold", () => {
    const r = effectiveAccess(
      inputs({
        patreon: { entitledTierIds: ["tier_gold"], status: "frozen" },
      }),
    );
    expect(r.accessLevel).toBe(THRESHOLD_LEVEL);
    expect(r.frozen).toBe(true);
    expect(r.inGrace).toBe(false);
  });

  it("frozen patreon but an active grant still grants that grant's level", () => {
    const r = effectiveAccess(
      inputs({
        patreon: { entitledTierIds: ["tier_gold"], status: "frozen" },
        grants: [{ accessLevel: 2, status: "active" }],
      }),
    );
    expect(r.accessLevel).toBe(2);
    expect(r.frozen).toBe(true);
  });
});

describe("effectiveAccess — grants", () => {
  it("active grant raises level above patreon", () => {
    const r = effectiveAccess(
      inputs({
        patreon: { entitledTierIds: ["tier_bronze"], status: "active" },
        grants: [{ accessLevel: 3, status: "active" }],
      }),
    );
    expect(r.accessLevel).toBe(3);
  });

  it("patreon level beats a lower grant", () => {
    const r = effectiveAccess(
      inputs({
        patreon: { entitledTierIds: ["tier_gold"], status: "active" },
        grants: [{ accessLevel: 1, status: "active" }],
      }),
    );
    expect(r.accessLevel).toBe(3);
  });

  it("frozen grant contributes nothing", () => {
    const r = effectiveAccess(
      inputs({
        grants: [{ accessLevel: 3, status: "frozen" }],
      }),
    );
    expect(r.accessLevel).toBe(THRESHOLD_LEVEL);
  });

  it("grant-only user with no patreon", () => {
    const r = effectiveAccess(
      inputs({
        grants: [
          { accessLevel: 1, status: "active" },
          { accessLevel: 2, status: "active" },
        ],
      }),
    );
    expect(r.accessLevel).toBe(2);
  });
});

describe("effectiveAccess — edge cases", () => {
  it("empty entitled tier list is treated as no patreon", () => {
    const r = effectiveAccess(
      inputs({ patreon: { entitledTierIds: [], status: "active" } }),
    );
    expect(r.accessLevel).toBe(THRESHOLD_LEVEL);
  });

  it("empty entitled list but frozen status still marks frozen", () => {
    const r = effectiveAccess(
      inputs({ patreon: { entitledTierIds: [], status: "frozen" } }),
    );
    expect(r.frozen).toBe(true);
    expect(r.accessLevel).toBe(THRESHOLD_LEVEL);
  });

  it("no mappings at all → mapped tiers fall back to default level", () => {
    const r = effectiveAccess({
      mappings: [],
      patreon: { entitledTierIds: ["tier_gold"], status: "active" },
    });
    expect(r.accessLevel).toBe(DEFAULT_MAPPED_LEVEL);
    expect(r.unmappedTierIds).toEqual(["tier_gold"]);
  });
});

describe("canAccess", () => {
  it.each([
    [0, 0, true],
    [0, 1, false],
    [2, 1, true],
    [2, 2, true],
    [2, 3, false],
    [3, 1, true],
  ])("access=%i minLevel=%i → %s", (access, min, expected) => {
    expect(canAccess(access, min)).toBe(expected);
  });
});
