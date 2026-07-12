import { describe, expect, it } from "vitest";
import { rankFor, rankScore } from "./logic";

describe("rankScore", () => {
  it("blends completions with half the chain", () => {
    expect(rankScore(10, 8)).toBe(14);
    expect(rankScore(0, 0)).toBe(0);
  });
});

describe("rankFor", () => {
  it("starts at Curious", () => {
    expect(rankFor(0, 0).name).toBe("Curious");
  });
  it("promotes as score crosses thresholds", () => {
    expect(rankFor(3, 0).name).toBe("Entranced");
    expect(rankFor(10, 0).name).toBe("Collared");
    expect(rankFor(20, 12).name).toBe("Conditioned"); // score 26
  });
  it("reaches 888 at the top", () => {
    expect(rankFor(100, 20).name).toBe("888");
  });
  it("reports the next rank + threshold", () => {
    const r = rankFor(3, 0);
    expect(r.next?.name).toBe("Collared");
    expect(r.next?.minScore).toBe(10);
  });
  it("no next rank at the top", () => {
    expect(rankFor(200, 0).next).toBeNull();
  });
});
