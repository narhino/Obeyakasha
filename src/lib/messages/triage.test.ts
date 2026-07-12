import { describe, expect, it } from "vitest";
import { needsPersonalHandling, triageMessage } from "./triage";

describe("triageMessage", () => {
  it("flags crisis language above all", () => {
    expect(triageMessage("i want to kill myself")).toBe("crisis");
    expect(triageMessage("thinking about self-harm again")).toBe("crisis");
  });
  it("flags age concerns", () => {
    expect(triageMessage("btw i'm 16")).toBe("age");
    expect(triageMessage("am i allowed if i'm a minor?")).toBe("age");
  });
  it("flags distress", () => {
    expect(triageMessage("i had a panic attack after that file")).toBe("distress");
    expect(triageMessage("i feel unsafe")).toBe("distress");
  });
  it("ordinary devotion is not flagged", () => {
    expect(triageMessage("Goddess, thank you, i feel so owned and calm")).toBe(
      "none",
    );
    expect(triageMessage("please make more chastity files")).toBe("none");
  });
  it("needsPersonalHandling is true for any non-none flag", () => {
    expect(needsPersonalHandling("crisis")).toBe(true);
    expect(needsPersonalHandling("none")).toBe(false);
  });
});
