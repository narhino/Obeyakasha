import { describe, expect, it } from "vitest";
import { tallyVotes, type PollOption } from "./tally";

const opts: PollOption[] = [
  { id: "o1", label: "A" },
  { id: "o2", label: "B" },
  { id: "o3", label: "C" },
];

describe("tallyVotes", () => {
  it("counts and computes percentages + winner", () => {
    const { results, total, winnerId } = tallyVotes(opts, [
      { optionId: "o1" },
      { optionId: "o1" },
      { optionId: "o2" },
    ]);
    expect(total).toBe(3);
    expect(winnerId).toBe("o1");
    expect(results.find((r) => r.optionId === "o1")!.pct).toBe(67);
    expect(results.find((r) => r.optionId === "o2")!.pct).toBe(33);
    expect(results.find((r) => r.optionId === "o3")!.count).toBe(0);
  });

  it("ignores votes for unknown options", () => {
    const { total } = tallyVotes(opts, [{ optionId: "zzz" }, { optionId: "o1" }]);
    expect(total).toBe(1);
  });

  it("no votes → no winner, zero pct", () => {
    const { total, winnerId, results } = tallyVotes(opts, []);
    expect(total).toBe(0);
    expect(winnerId).toBeNull();
    expect(results.every((r) => r.pct === 0)).toBe(true);
  });

  it("first option wins a tie (stable)", () => {
    const { winnerId } = tallyVotes(opts, [{ optionId: "o1" }, { optionId: "o2" }]);
    expect(winnerId).toBe("o1");
  });
});
