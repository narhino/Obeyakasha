import { describe, expect, it } from "vitest";
import { isGoddessIdentity } from "./sync";

describe("isGoddessIdentity", () => {
  it("matches by numeric Patreon id", () => {
    expect(isGoddessIdentity("123", null, "123", undefined)).toBe(true);
  });

  it("matches by email, case-insensitively", () => {
    expect(
      isGoddessIdentity("999", "Akasha@Example.com", undefined, "akasha@example.com"),
    ).toBe(true);
  });

  it("does not match a different id or email", () => {
    expect(isGoddessIdentity("999", "someone@else.com", "123", "akasha@x.com")).toBe(
      false,
    );
  });

  it("is false when no admin is configured", () => {
    expect(isGoddessIdentity("123", "a@b.com", undefined, undefined)).toBe(false);
  });

  it("ignores email match when email is missing", () => {
    expect(isGoddessIdentity("999", null, undefined, "akasha@x.com")).toBe(false);
  });
});
