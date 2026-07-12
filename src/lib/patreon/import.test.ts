import { describe, expect, it } from "vitest";
import { htmlToText } from "./import";

describe("htmlToText", () => {
  it("strips tags and decodes common entities", () => {
    const out = htmlToText(
      "<p>Kneel &amp; obey.</p><p>You&#39;re mine.</p>",
    );
    expect(out).toBe("Kneel & obey.\n\nYou're mine.");
  });

  it("turns <br> into newlines and collapses blank runs", () => {
    expect(htmlToText("a<br>b<br/><br/><br/>c")).toBe("a\nb\n\nc");
  });

  it("handles empty input", () => {
    expect(htmlToText("")).toBe("");
  });
});
