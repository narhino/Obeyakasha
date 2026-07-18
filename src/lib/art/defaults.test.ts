import { describe, expect, it } from "vitest";
import {
  COLLECTION_COVER,
  coverFamilyForTags,
  DEFAULT_COVER,
  defaultCoverFor,
} from "./defaults";

describe("coverFamilyForTags — each family matches its own tags", () => {
  it.each([
    ["collar", "collar"],
    ["ownership", "collar"],
    ["worship", "worship"],
    ["devotion", "worship"],
    ["goddess worship", "worship"],
    ["obedience", "obedience"],
    ["submission", "obedience"],
    ["protocol", "obedience"],
    ["discipline", "obedience"],
    ["service", "obedience"],
    ["surrender", "obedience"],
    ["mindlessness", "blank"],
    ["blank", "blank"],
    ["drone", "blank"],
    ["brainwashing", "blank"],
    ["mind control", "blank"],
    ["chastity", "denial"],
    ["denial", "denial"],
    ["tease and denial", "denial"],
    ["orgasm control", "denial"],
    ["edging", "denial"],
    ["obsession", "addiction"],
    ["addiction", "addiction"],
    ["conditioning", "addiction"],
    ["reinforcement", "addiction"],
    ["trigger install", "addiction"],
    ["bimbofication", "transformation"],
    ["dollification", "transformation"],
    ["transformation", "transformation"],
    ["pet play", "transformation"],
    ["good boy", "transformation"],
    ["good girl", "transformation"],
    ["praise", "praise"],
    ["acceptance", "praise"],
    ["confidence", "praise"],
    ["self-love", "praise"],
    ["relaxation", "praise"],
    ["gentle", "praise"],
    ["findom", "tribute"],
    ["tribute", "tribute"],
    ["sleep", "sleep"],
    ["nap", "sleep"],
    ["sleep aid", "sleep"],
    ["ritual", "ritual"],
    ["daily task", "ritual"],
    ["mantra", "ritual"],
    ["affirmations", "ritual"],
    ["conditioning session", "ritual"],
    ["training session", "ritual"],
    ["check-in", "ritual"],
    ["hypnosis", "trance"],
    ["induction", "trance"],
    ["deepening", "trance"],
    ["story", "trance"],
    ["trance", "trance"],
    ["binaural", "trance"],
    ["subliminal", "trance"],
  ])("%s → %s", (tag, family) => {
    expect(coverFamilyForTags([tag])).toBe(family);
  });
});

describe("coverFamilyForTags — priority order (higher family wins)", () => {
  it("collar outranks every other family", () => {
    expect(coverFamilyForTags(["collar", "worship", "chastity", "sleep"])).toBe(
      "collar",
    );
  });
  it("worship outranks obedience", () => {
    expect(coverFamilyForTags(["obedience", "worship"])).toBe("worship");
  });
  it("blank outranks denial", () => {
    expect(coverFamilyForTags(["chastity", "blank"])).toBe("blank");
  });
  it("addiction outranks transformation", () => {
    expect(coverFamilyForTags(["dollification", "addiction"])).toBe("addiction");
  });
  it("tribute outranks praise", () => {
    expect(coverFamilyForTags(["praise", "findom"])).toBe("tribute");
  });
});

describe("coverFamilyForTags — theme outranks format/purpose", () => {
  it("chastity (theme→denial) beats hypnosis (format→trance)", () => {
    expect(coverFamilyForTags(["chastity", "hypnosis"])).toBe("denial");
  });
  it("worship (theme) beats induction (format→trance)", () => {
    expect(coverFamilyForTags(["induction", "worship"])).toBe("worship");
  });
  it("obedience (theme) beats a ritual purpose (mantra)", () => {
    expect(coverFamilyForTags(["mantra", "obedience"])).toBe("obedience");
  });
  it("a format-only track still resolves to its format family", () => {
    expect(coverFamilyForTags(["binaural"])).toBe("trance");
  });
});

describe("coverFamilyForTags — case & whitespace insensitivity", () => {
  it("uppercase matches", () => {
    expect(coverFamilyForTags(["CHASTITY"])).toBe("denial");
  });
  it("mixed case + surrounding whitespace matches", () => {
    expect(coverFamilyForTags(["  Goddess Worship  "])).toBe("worship");
  });
});

describe("coverFamilyForTags — no match", () => {
  it("empty tag list → default", () => {
    expect(coverFamilyForTags([])).toBe("default");
  });
  it("unknown tags only → default", () => {
    expect(coverFamilyForTags(["halloween", "anime", "seasonal"])).toBe(
      "default",
    );
  });
  it("unknown tags are ignored; a known tag still wins", () => {
    expect(coverFamilyForTags(["halloween", "sleep"])).toBe("sleep");
  });
});

describe("defaultCoverFor — resolved paths", () => {
  it("maps a family to its /art/covers path", () => {
    expect(defaultCoverFor(["chastity"])).toBe("/art/covers/denial.jpg");
  });
  it("multi-word theme resolves its path", () => {
    expect(defaultCoverFor(["good girl"])).toBe(
      "/art/covers/transformation.jpg",
    );
  });
  it("no match resolves to the default cover", () => {
    expect(defaultCoverFor([])).toBe(DEFAULT_COVER);
    expect(defaultCoverFor(["unknown"])).toBe("/art/covers/default.jpg");
  });
});

describe("committed constants", () => {
  it("default + collection covers point at committed art", () => {
    expect(DEFAULT_COVER).toBe("/art/covers/default.jpg");
    expect(COLLECTION_COVER).toBe("/art/covers/collection.jpg");
  });
});
