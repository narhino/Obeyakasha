/**
 * QA fixture seed for the R-QA teardown (test-only; runs against the local
 * sandbox Postgres, never shipped). Creates: goddess + subject (level 2, intake
 * done, consented), playable WAV tracks (incl. one locked at level 9 and one
 * patreon shell), transcripts for search, tags, a series with cadence + items,
 * a training, whispers (public/pinned/poll + leveled), orders (deadline, proof
 * modes), a wish with reply, a moment, and a commission mid-progress.
 */
import { db } from "@/lib/db";
import {
  users, entitlements, consents,
  tracks, transcripts, tags, trackTags,
  playlists, playlistItems, programs, programItems,
  whispers, polls, orders, orderAssignments,
  wishes, moments, commissions,
} from "@/lib/db/schema";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// 30s mono 8kHz sine WAV (valid, small, seekable).
function makeWav(path: string, seconds = 30, freq = 220) {
  const rate = 8000, n = rate * seconds;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 8000 * Math.exp(-i / (n * 0.9)));
    data.writeInt16LE(v, i * 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write("WAVE", 8);
  hdr.write("fmt ", 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(rate, 24); hdr.writeUInt32LE(rate * 2, 28);
  hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36);
  hdr.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([hdr, data]));
}

async function main() {
  const mediaRoot = process.env.MEDIA_LOCAL_DIR ?? "./media-local";
  mkdirSync(join(mediaRoot, "stream"), { recursive: true });

  const [goddess] = await db.insert(users).values({
    email: "akasha@qa.local", role: "goddess", chosenName: "Akasha", status: "active",
  }).returning();
  const [sub] = await db.insert(users).values({
    email: "subject@qa.local", role: "subject", chosenName: "moth", status: "active",
  }).returning();
  const gid = goddess!.id, uid = sub!.id;

  await db.insert(entitlements).values({ userId: uid, accessLevel: 2, source: "grant", status: "active", reason: "qa" });
  await db.insert(consents).values([
    { userId: uid, kind: "age" }, { userId: uid, kind: "hypnosis_terms" }, { userId: uid, kind: "privacy" },
  ]);

  // Tracks
  const mk = async (title: string, level: number, opts: { publish?: boolean; freq?: number; slug: string }) => {
    const [t] = await db.insert(tracks).values({
      title, slug: opts.slug, minAccessLevel: level,
      description: `${title} — she takes you lower, and you thank her for it.`,
      visibility: opts.publish === false ? "draft" : "published",
      publishedAt: opts.publish === false ? null : new Date(),
      pipeline: "ready", durationS: 30,
    }).returning();
    const key = `stream/${t!.id}.wav`;
    makeWav(join(mediaRoot, key), 30, opts.freq ?? 220);
    await db.update(tracks).set({ streamKey: key }).where(eq(tracks.id, t!.id));
    return t!.id;
  };
  const { eq } = await import("drizzle-orm");
  const t1 = await mk("Descend With Me", 1, { slug: "descend-with-me", freq: 196 });
  const t2 = await mk("Locked By Akasha — Day 1", 2, { slug: "locked-day-1", freq: 220 });
  const t3 = await mk("Locked By Akasha — Day 2", 2, { slug: "locked-day-2", freq: 247 });
  const tLocked = await mk("The Inner Sanctum", 9, { slug: "inner-sanctum", freq: 175 });
  const tDraft = await mk("Unfinished Descent", 1, { slug: "unfinished-descent", publish: false });
  // Patreon shell (no audio)
  await db.insert(tracks).values({
    title: "Whispers From The Deep (shell)", slug: "whispers-shell",
    description: "Imported from Patreon — audio pending.",
    visibility: "draft", source: "patreon_import", patreonPostId: "qa-post-1",
  });

  await db.insert(transcripts).values({
    trackId: t2, status: "done", language: "en",
    fullText: "Kneel and breathe. The clicker owns your breath. Deeper now, my good moth.",
    segments: [
      { start: 0, end: 6, text: "Kneel and breathe." },
      { start: 6, end: 14, text: "The clicker owns your breath." },
      { start: 14, end: 24, text: "Deeper now, my good moth." },
    ], model: "qa",
  });

  const pick = async (kind: "purpose"|"theme"|"format"|"intensity", value: string) => {
    const row = await db.select().from(tags).where(eq(tags.value, value)).limit(1);
    return row[0]?.id ?? (await db.insert(tags).values({ kind, value }).returning())[0]!.id;
  };
  await db.insert(trackTags).values([
    { trackId: t1, tagId: await pick("purpose", "induction"), source: "admin" },
    { trackId: t2, tagId: await pick("theme", "chastity"), source: "admin" },
    { trackId: t2, tagId: await pick("format", "hypnosis"), source: "admin" },
    { trackId: t3, tagId: await pick("theme", "chastity"), source: "admin" },
    { trackId: tLocked, tagId: await pick("intensity", "deep"), source: "admin" },
  ]);

  const [series] = await db.insert(playlists).values({
    title: "Locked By Akasha", description: "Thirty days. One key. Mine.",
    visibility: "published", kind: "curated", cadence: "weekly",
  }).returning();
  await db.insert(playlistItems).values([
    { playlistId: series!.id, trackId: t2, sort: 0 },
    { playlistId: series!.id, trackId: t3, sort: 1 },
  ]);
  const [training] = await db.insert(programs).values({
    title: "Servant Training Academy", slug: "servant-training",
    description: "You will learn to serve properly.", gating: "sequential",
    cadence: "ongoing", visibility: "published", minAccessLevel: 1,
  }).returning();
  await db.insert(programItems).values([
    { programId: training!.id, trackId: t1, sort: 0, dayNumber: 1 },
    { programId: training!.id, trackId: t2, sort: 1, dayNumber: 2 },
  ]);

  const [poll] = await db.insert(polls).values({
    question: "What do you crave next?", audience: { type: "public" },
    options: [{ id: "a", label: "Deeper conditioning" }, { id: "b", label: "A gentler descent" }],
    status: "open", resultsShared: false,
  }).returning();
  await db.insert(whispers).values([
    { body: "The door is open. Step inside and kneel.", audience: { type: "public" }, pinned: true, publishedAt: new Date(Date.now() - 3600e3) },
    { body: "Choose. I am listening.", audience: { type: "public" }, pollId: poll!.id, publishedAt: new Date(Date.now() - 1800e3) },
    { body: "My level-two pets: something waits for you tonight.", audience: { type: "level", level: 2 }, publishedAt: new Date(Date.now() - 900e3) },
  ]);

  const [o1] = await db.insert(orders).values({
    title: "Kneel for five minutes", body: "Before sleep. Time it.",
    audience: { type: "users", userIds: [uid] }, requires: "ack",
    proofMode: "optional", dueAt: new Date(Date.now() + 20 * 3600e3),
  }).returning();
  const [o2] = await db.insert(orders).values({
    title: "Write one sentence of devotion", body: "Leave it where I will read it.",
    audience: { type: "users", userIds: [uid] }, requires: "text", proofMode: "required",
  }).returning();
  await db.insert(orderAssignments).values([
    { orderId: o1!.id, userId: uid, status: "sent" },
    { orderId: o2!.id, userId: uid, status: "sent" },
  ]);

  await db.insert(wishes).values({
    userId: uid, source: "wishbox", status: "new", title: "A rainy-night descent",
    body: "Please, one with rain and your slow count.", reply: "Patience, moth. It is already forming.", repliedAt: new Date(),
  });
  await db.insert(moments).values({ userId: uid, kind: "praised", payload: { orderTitle: "Kneel for five minutes" } });
  await db.insert(commissions).values({
    userId: uid, answers: { desire: "A personal descent trigger" },
    status: "in_progress", stage: "voice", acceptedAt: new Date(Date.now() - 5 * 86400e3),
  });

  console.log(JSON.stringify({ gid, uid, t1, t2, series: series!.id }, null, 0));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
