/**
 * Materialize the D1 art library (scripts/art-manifest.json) into public/art/.
 * Downloads each generated image, resizes + compresses to JPEG via sharp
 * (resolved from next's dependency tree), and writes the committed paths.
 * Needs egress to the CDN in art-manifest.json — run locally or on the server,
 * then commit the resulting files. Idempotent; pass --force to re-download.
 *
 *   node scripts/fetch-art.mjs [--force]
 */
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const force = process.argv.includes("--force");

function loadSharp() {
  const attempts = [
    () => createRequire(path.join(root, "package.json"))("sharp"),
    () =>
      createRequire(
        createRequire(path.join(root, "package.json")).resolve(
          "next/package.json",
        ),
      )("sharp"),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      /* try next */
    }
  }
  return null;
}

const sharp = loadSharp();
if (!sharp) {
  console.warn("sharp not found — images will be saved as original PNG bytes");
}

const manifest = JSON.parse(
  await readFile(path.join(root, "scripts/art-manifest.json"), "utf8"),
);

let done = 0;
for (const item of manifest.items) {
  const outPath = path.join(root, item.out);
  if (!force) {
    try {
      await access(outPath);
      console.log(`skip (exists)  ${item.out}`);
      done++;
      continue;
    } catch {
      /* missing — fetch it */
    }
  }
  const url = manifest.base + item.file;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAILED ${res.status}  ${item.out}  (${url})`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(outPath), { recursive: true });
  if (sharp) {
    // The generator matted every piece in a white gallery border — trim it,
    // then covers/empty get an exact square center-crop, wide art keeps ratio.
    const square = /\/covers\/|\/empty\.jpg$/.test(item.out);
    let img = sharp(await sharp(buf).trim({ threshold: 25 }).toBuffer());
    // Shave a few px more in case the trim left a sliver of matte.
    const meta = await img.metadata();
    const inset = 4;
    img = sharp(
      await img
        .extract({
          left: inset,
          top: inset,
          width: meta.width - inset * 2,
          height: meta.height - inset * 2,
        })
        .toBuffer(),
    );
    const w = meta.width - inset * 2;
    const h = meta.height - inset * 2;
    const pipe = square
      ? img.resize(Math.min(item.max, w, h), Math.min(item.max, w, h), {
          fit: "cover",
        })
      : img.resize({ width: Math.min(item.max, w) });
    await pipe.jpeg({ quality: 82, mozjpeg: true }).toFile(outPath);
  } else {
    await writeFile(outPath.replace(/\.jpg$/, ".png"), buf);
  }
  console.log(`wrote          ${item.out}`);
  done++;
}

console.log(`\n${done}/${manifest.items.length} in place.`);
if (done < manifest.items.length) process.exitCode = 1;
