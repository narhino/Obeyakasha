import { describe, expect, it } from "vitest";
import {
  canPetition,
  daysUntilEligible,
  oathState,
  type OathInputs,
} from "./logic";

const base: OathInputs = {
  oathAt: null,
  oathPetitionedAt: null,
  currentStreak: 0,
  minStreak: 21,
};

describe("oathState", () => {
  it("is sealed below the streak threshold", () => {
    expect(oathState({ ...base, currentStreak: 20 })).toBe("sealed");
    expect(oathState({ ...base, currentStreak: 0 })).toBe("sealed");
  });

  it("becomes eligible once the streak meets the threshold", () => {
    expect(oathState({ ...base, currentStreak: 21 })).toBe("eligible");
    expect(oathState({ ...base, currentStreak: 40 })).toBe("eligible");
  });

  it("reads as petitioned once asked, regardless of streak", () => {
    expect(
      oathState({ ...base, currentStreak: 5, oathPetitionedAt: new Date() }),
    ).toBe("petitioned");
  });

  it("collared wins over a lingering petition timestamp", () => {
    expect(
      oathState({
        ...base,
        currentStreak: 100,
        oathPetitionedAt: new Date("2026-01-01"),
        oathAt: new Date("2026-02-01"),
      }),
    ).toBe("collared");
  });

  it("collared even if the streak later lapses below threshold", () => {
    expect(oathState({ ...base, currentStreak: 1, oathAt: new Date() })).toBe(
      "collared",
    );
  });
});

describe("daysUntilEligible", () => {
  it("counts the days still owed", () => {
    expect(daysUntilEligible(0, 21)).toBe(21);
    expect(daysUntilEligible(20, 21)).toBe(1);
  });

  it("clamps to zero once earned", () => {
    expect(daysUntilEligible(21, 21)).toBe(0);
    expect(daysUntilEligible(50, 21)).toBe(0);
  });
});

describe("canPetition", () => {
  it("only when eligible", () => {
    expect(canPetition({ ...base, currentStreak: 21 })).toBe(true);
  });

  it("not while sealed", () => {
    expect(canPetition({ ...base, currentStreak: 10 })).toBe(false);
  });

  it("not once already petitioned", () => {
    expect(
      canPetition({ ...base, currentStreak: 30, oathPetitionedAt: new Date() }),
    ).toBe(false);
  });

  it("not once collared", () => {
    expect(
      canPetition({ ...base, currentStreak: 30, oathAt: new Date() }),
    ).toBe(false);
  });
});
