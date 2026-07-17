import { describe, expect, it } from "vitest";
import {
  DISGUISE_ICON,
  DISGUISE_MESSAGES,
  disguisePayload,
  pickDisguiseIndex,
} from "./disguise";

describe("pickDisguiseIndex", () => {
  it("stays within the pool for any seed", () => {
    for (const seed of [0, 1, 7, 999, 1_700_000_000_000]) {
      const i = pickDisguiseIndex(seed);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(DISGUISE_MESSAGES.length);
    }
  });
  it("is deterministic for a given seed", () => {
    expect(pickDisguiseIndex(3)).toBe(pickDisguiseIndex(3));
    expect(pickDisguiseIndex(DISGUISE_MESSAGES.length)).toBe(0);
  });
  it("handles negative seeds without going out of range", () => {
    const i = pickDisguiseIndex(-1);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(DISGUISE_MESSAGES.length);
  });
});

describe("disguisePayload", () => {
  const original = {
    title: "Come back to me, my subject.",
    body: "I want you under before the night is out.",
    deepLink: "/library/track/deep-drop",
    tag: "whisper-42",
    id: "notif-1",
  };

  it("replaces title and body with a mundane pool entry", () => {
    const out = disguisePayload(original, 0);
    const msg = DISGUISE_MESSAGES[0]!;
    expect(out.title).toBe(msg.title);
    expect(out.body).toBe(msg.body);
    // The intimate original never survives onto the lock screen.
    expect(out.title).not.toBe(original.title);
    expect(out.body).not.toBe(original.body);
  });

  it("swaps in the neutral icon", () => {
    const out = disguisePayload(original, 1) as typeof original & {
      icon?: string;
    };
    expect(out.icon).toBe(DISGUISE_ICON);
  });

  it("preserves the deep link and tag so the tap target is unchanged", () => {
    const out = disguisePayload(original, 2);
    expect(out.deepLink).toBe(original.deepLink);
    expect(out.tag).toBe(original.tag);
    expect(out.id).toBe(original.id);
  });

  it("does not mutate the input payload", () => {
    const copy = { ...original };
    disguisePayload(original, 3);
    expect(original).toEqual(copy);
  });

  it("rotates across the pool as the seed advances", () => {
    const titles = new Set(
      Array.from({ length: DISGUISE_MESSAGES.length }, (_, i) =>
        disguisePayload(original, i).body,
      ),
    );
    // Every distinct pool body is reachable by advancing the seed.
    expect(titles.size).toBe(new Set(DISGUISE_MESSAGES.map((m) => m.body)).size);
  });
});
