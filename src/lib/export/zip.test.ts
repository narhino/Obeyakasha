import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeZip, slugForFile } from "./zip";

/** The archive is proved against the real tool, where the real tool exists. */
const HAS_UNZIP = (() => {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("the export archive — hand-rolled, so it is proved against a real unzip", () => {
  it.skipIf(!HAS_UNZIP)("produces an archive the operating system can actually open, with the bytes intact", () => {
    // Includes the things that break naive zip writers: non-ASCII, newlines,
    // an empty file, and a nested path.
    const entries = [
      { name: "README.md", content: "# Akasha\n\nEverything.\n" },
      { name: "subjects/marc-a1b2c3d4.md", content: "# Marc\n\n> « il m'a dit ça »\n" },
      { name: "all-subjects.jsonl", content: "" },
    ];
    const dir = mkdtempSync(join(tmpdir(), "akasha-zip-"));
    const zipPath = join(dir, "out.zip");
    writeFileSync(zipPath, makeZip(entries));

    // `unzip -t` verifies every CRC — a wrong checksum or offset fails here.
    const tested = execFileSync("unzip", ["-t", zipPath], { encoding: "utf8" });
    expect(tested).toContain("No errors detected");

    execFileSync("unzip", ["-q", "-o", zipPath, "-d", join(dir, "out")]);
    expect(readFileSync(join(dir, "out", "README.md"), "utf8")).toBe(
      entries[0]!.content,
    );
    // Nested path survived, and UTF-8 came back byte-for-byte.
    expect(
      readFileSync(join(dir, "out", "subjects", "marc-a1b2c3d4.md"), "utf8"),
    ).toBe(entries[1]!.content);
    expect(readFileSync(join(dir, "out", "all-subjects.jsonl"), "utf8")).toBe("");
  });

  it("never lets a chosen name become a path or a surprise", () => {
    expect(slugForFile("../../etc/passwd")).toBe("etc-passwd");
    expect(slugForFile("Marc / Le Chien")).toBe("marc-le-chien");
    expect(slugForFile("  ")).toBe("subject");
  });
});
