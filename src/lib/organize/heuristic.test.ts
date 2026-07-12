import { describe, expect, it } from "vitest";
import { heuristicOrganize } from "./heuristic";
import type { OrganizeInput } from "./types";

function input(partial: Partial<OrganizeInput>): OrganizeInput {
  return {
    title: "",
    description: null,
    fullText: "",
    segments: [],
    knownTriggers: [],
    ...partial,
  };
}

describe("heuristicOrganize", () => {
  it("maps title bracket tokens to tags", () => {
    const p = heuristicOrganize(
      input({ title: "Training Session 3 [F4M] [FDOM] [Hypnosis]" }),
    );
    const values = p.tags.map((t) => t.value);
    expect(values).toContain("femdom");
    expect(values).toContain("pure hypnosis");
  });

  it("detects themes from transcript keywords", () => {
    const p = heuristicOrganize(
      input({
        title: "A session",
        fullText: "you will stay locked in chastity and obey me, kneel",
      }),
    );
    const values = p.tags.map((t) => t.value);
    expect(values).toContain("chastity");
    expect(values).toContain("obedience");
  });

  it("always assigns at least a purpose tag", () => {
    const p = heuristicOrganize(input({ title: "Untitled", fullText: "hello" }));
    expect(p.tags.some((t) => t.kind === "purpose")).toBe(true);
  });

  it("finds a known trigger in the transcript with evidence + relation", () => {
    const p = heuristicOrganize(
      input({
        title: "Conditioning",
        fullText: "from now on, the clicker sends you down. the clicker. good.",
        segments: [
          { start: 10, end: 14, text: "the clicker sends you down" },
        ],
        knownTriggers: [{ name: "the clicker", slug: "the-clicker" }],
      }),
    );
    expect(p.triggers).toHaveLength(1);
    expect(p.triggers[0]!.name).toBe("the clicker");
    expect(p.triggers[0]!.relation).toBe("installs"); // "from now on" present
    expect(p.triggers[0]!.evidence[0]?.start).toBe(10);
  });

  it("suggests programs from title patterns", () => {
    const a = heuristicOrganize(input({ title: "Training Session 4 - Addiction" }));
    expect(a.playlists.some((p) => p.target === "Training Sessions")).toBe(true);
    const b = heuristicOrganize(input({ title: "Locked by AKASHA - DAY 2" }));
    expect(b.playlists.some((p) => p.target === "30 Days Chastity")).toBe(true);
  });

  it("does not invent triggers that aren't in the transcript", () => {
    const p = heuristicOrganize(
      input({
        title: "x",
        fullText: "nothing relevant here",
        knownTriggers: [{ name: "the clicker", slug: "the-clicker" }],
      }),
    );
    expect(p.triggers).toHaveLength(0);
  });
});
