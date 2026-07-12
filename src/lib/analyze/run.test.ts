import { describe, expect, it } from "vitest";
import { analysisDossierSchema } from "./schema";
import { heuristicDossier } from "./run";
import type { OrganizeInput } from "@/lib/organize/types";

function input(partial: Partial<OrganizeInput>): OrganizeInput {
  return {
    title: "Descent",
    description: null,
    fullText: "",
    segments: [],
    knownTriggers: [],
    ...partial,
  };
}

describe("heuristicDossier", () => {
  it("produces a schema-valid dossier from title/keywords", () => {
    const d = heuristicDossier(
      input({
        title: "[FDOM] Locked by Akasha",
        fullText: "kneel and obey, deeper now",
      }),
    );
    // Re-parse to assert it satisfies the contract.
    expect(() => analysisDossierSchema.parse(d)).not.toThrow();
    expect(d.keywords.length).toBeGreaterThan(0);
    expect(d.keywords.every((k) => k.status === "proposed")).toBe(true);
  });

  it("maps tag kinds to shibbydex-style categories", () => {
    const d = heuristicDossier(input({ title: "[FDOM] Obey", fullText: "obey" }));
    const femdom = d.keywords.find((k) => k.phrase === "femdom");
    expect(femdom?.category).toBe("fetish"); // theme → fetish
    const kinds = new Set(d.keywords.map((k) => k.category));
    // induction default (purpose) maps to hypnosis_type
    expect(kinds.has("hypnosis_type")).toBe(true);
  });

  it("carries trigger evidence timestamps through", () => {
    const d = heuristicDossier(
      input({
        title: "Anchor",
        fullText: "your trigger is the clicker",
        segments: [{ start: 3, end: 6, text: "your trigger is the clicker" }],
        knownTriggers: [{ name: "the clicker", slug: "the-clicker" }],
      }),
    );
    const trig = d.triggers.find((t) => t.name === "the clicker");
    expect(trig).toBeTruthy();
    expect(trig?.evidence[0]?.start).toBe(3);
  });
});
