import { describe, expect, it } from "vitest";
import {
  HIGH_CONFIDENCE,
  MATCH_FLOOR,
  normalizeFilename,
  normalizeTitle,
  proposeMatches,
  scoreMatch,
} from "./match";

describe("normalize", () => {
  it("strips the extension, underscores and punctuation from a filename", () => {
    expect(normalizeFilename("Locked_By_Akasha_Day_3.mp3")).toBe(
      "locked by akasha day 3",
    );
  });

  it("strips brackets, em-dashes and punctuation from a title", () => {
    expect(normalizeTitle("Locked By Akasha — Day 3 [FDOM]")).toBe(
      "locked by akasha day 3 fdom",
    );
  });

  it("does not treat a trailing number as an extension", () => {
    expect(normalizeFilename("Day 3")).toBe("day 3");
  });
});

describe("scoreMatch", () => {
  it("scores the real filename↔title pair as a confident match", () => {
    const score = scoreMatch(
      "Locked_By_Akasha_Day_3.mp3",
      "Locked By Akasha — Day 3 [FDOM]",
    );
    expect(score).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  it("is symmetric-ish: extension and case never change the outcome", () => {
    const a = scoreMatch("deep-drop-training-2.m4a", "Deep Drop Training 2");
    const b = scoreMatch("DEEP DROP TRAINING 2", "deep drop training 2.mp3");
    expect(a).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
    expect(b).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
  });

  it("scores an unrelated file near zero", () => {
    expect(
      scoreMatch("grocery_list.mp3", "Locked By Akasha — Day 3 [FDOM]"),
    ).toBeLessThan(MATCH_FLOOR);
  });

  it("returns 0 when either side is empty after normalizing", () => {
    expect(scoreMatch("___.mp3", "Real Title")).toBe(0);
    expect(scoreMatch("real-file.mp3", "!!!")).toBe(0);
  });
});

describe("proposeMatches", () => {
  const shells = [
    { id: "s-day1", title: "Locked By Akasha — Day 1 [FDOM]" },
    { id: "s-day2", title: "Locked By Akasha — Day 2 [FDOM]" },
    { id: "s-day3", title: "Locked By Akasha — Day 3 [FDOM]" },
    { id: "s-sleep", title: "Deep Sleep Spiral [Hypnosis]" },
  ];

  it("pairs each file with its own day and never reuses a shell", () => {
    const files = [
      "Locked_By_Akasha_Day_2.mp3",
      "Locked_By_Akasha_Day_3.mp3",
      "Locked_By_Akasha_Day_1.mp3",
    ];
    const proposals = proposeMatches(files, shells);

    expect(proposals.map((p) => p.shellId)).toEqual([
      "s-day2",
      "s-day3",
      "s-day1",
    ]);
    const assigned = proposals.map((p) => p.shellId);
    expect(new Set(assigned).size).toBe(assigned.length); // no shell reused
    expect(proposals.every((p) => p.confidence === "high")).toBe(true);
  });

  it("returns one proposal per file, in input order", () => {
    const files = ["Deep_Sleep_Spiral.mp3", "totally_unrelated_audio.wav"];
    const proposals = proposeMatches(files, shells);
    expect(proposals).toHaveLength(2);
    expect(proposals[0]!.fileIndex).toBe(0);
    expect(proposals[0]!.shellId).toBe("s-sleep");
    // The unrelated file matches nothing → flagged for manual assignment.
    expect(proposals[1]!.shellId).toBeNull();
    expect(proposals[1]!.confidence).toBe("none");
  });

  it("lets a strong pair claim the contested shell, leaving the weaker file unmatched", () => {
    // Both files reference 'day 3', but only one shell for it exists. The closer
    // filename should win the shell; the other file is left unmatched (not
    // mis-assigned to a different day).
    const twoShells = [
      { id: "s-day3", title: "Locked By Akasha — Day 3 [FDOM]" },
    ];
    const files = [
      "random_take_day_3.mp3",
      "Locked_By_Akasha_Day_3.mp3",
    ];
    const proposals = proposeMatches(files, twoShells);
    const winner = proposals.find((p) => p.shellId === "s-day3");
    expect(winner?.fileName).toBe("Locked_By_Akasha_Day_3.mp3");
    expect(
      proposals.filter((p) => p.shellId === "s-day3"),
    ).toHaveLength(1);
  });

  it("handles no shells and no files without throwing", () => {
    expect(proposeMatches([], shells)).toEqual([]);
    expect(proposeMatches(["a.mp3"], [])).toEqual([
      { fileIndex: 0, fileName: "a.mp3", shellId: null, score: 0, confidence: "none" },
    ]);
  });
});
