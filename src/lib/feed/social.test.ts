import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  messages,
  threads,
  tracks,
  users,
  whisperComments,
  whispers,
} from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { truncateAll } from "@/lib/test/db";
import { copy } from "@/copy/copy";
import { publicWhispers, whispersForSubject } from "./whispers";
import { loveCount, loveCountsFor, lovedSetFor, toggleLove } from "./loves";
import {
  MAX_COMMENTS_PER_WHISPER,
  commentsForViewer,
  createComment,
  deleteComment,
  markCommentsRead,
  replyToComment,
  totalUnreadComments,
  unreadCommentCountsFor,
  whisperCommentsAdmin,
} from "./comments";

async function makeSubject(name?: string): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ role: "subject", chosenName: name ?? null })
    .returning();
  return u!.id;
}
/** A published whisper. `public` so it appears in BOTH feed paths (subject + anon). */
async function makeWhisper(
  audience: Audience = { type: "public" },
  body = "Come under for me.",
): Promise<string> {
  const [w] = await db
    .insert(whispers)
    .values({ body, audience, publishedAt: new Date() })
    .returning();
  return w!.id;
}

beforeEach(async () => {
  await truncateAll();
});

describe("F3 loves — one per subject, aggregate only (D7)", () => {
  it("toggles on/off, caps at one per subject, and exposes ONLY the aggregate", async () => {
    const A = await makeSubject("Marc");
    const B = await makeSubject("Paul");
    const C = await makeSubject("Sten");
    const w = await makeWhisper();

    // Toggle on, off, on — idempotent one-per-subject.
    expect(await toggleLove(A, w)).toEqual({ loved: true, count: 1 });
    expect(await toggleLove(A, w)).toEqual({ loved: false, count: 0 });
    expect(await toggleLove(A, w)).toEqual({ loved: true, count: 1 });
    // A double insert can never make it 2 (PK): re-loving is a no-op count-wise.
    const second = await toggleLove(B, w);
    expect(second).toEqual({ loved: true, count: 2 });

    // Aggregate readers.
    expect(await loveCount(w)).toBe(2);
    expect((await loveCountsFor([w])).get(w)).toBe(2);

    // The ONLY per-viewer love signal is the viewer's OWN set — never others'.
    expect((await lovedSetFor(A, [w])).has(w)).toBe(true);
    expect((await lovedSetFor(B, [w])).has(w)).toBe(true);
    expect((await lovedSetFor(C, [w])).has(w)).toBe(false); // C can't learn A/B loved

    // Feed payloads: everyone sees the count; `loved` is only ever the viewer's.
    const [bCard] = await whispersForSubject(B, 3);
    expect(bCard!.loveCount).toBe(2);
    expect(bCard!.loved).toBe(true);
    const [cCard] = await whispersForSubject(C, 3);
    expect(cCard!.loveCount).toBe(2);
    expect(cCard!.loved).toBe(false);

    // Anonymous: the aggregate only, never a loved flag or a member.
    const [anon] = await publicWhispers();
    expect(anon!.loveCount).toBe(2);
    expect(anon!.loved).toBe(false);
  });
});

describe("F3 comments — private to author + goddess (D7 absolute)", () => {
  it("B cannot read A's comment via feed, reader, or count; A + goddess can; anon none", async () => {
    const A = await makeSubject("Marc");
    const B = await makeSubject("Paul");
    const w = await makeWhisper();

    const made = await createComment(A, w, "my secret is xylophone888, only for you");
    expect(made.ok).toBe(true);

    // ── Feed payload ──────────────────────────────────────────────────────
    const [aCard] = await whispersForSubject(A, 3);
    expect(aCard!.comments).toHaveLength(1);
    expect(aCard!.comments[0]!.body).toContain("xylophone888");
    expect(aCard!.comments[0]!.state).toBe("unheard");

    const [bCard] = await whispersForSubject(B, 3);
    expect(bCard!.comments).toHaveLength(0); // never A's comment
    // …and no comment COUNT leaks onto a subject's card at all (D7).
    expect(bCard).not.toHaveProperty("commentCount");
    expect(bCard).not.toHaveProperty("commentsCount");

    const [anon] = await publicWhispers();
    expect(anon!.comments).toHaveLength(0);
    expect(anon).not.toHaveProperty("commentCount");

    // ── Direct readers ────────────────────────────────────────────────────
    expect((await commentsForViewer(B, [w])).get(w) ?? []).toHaveLength(0);
    expect((await commentsForViewer(A, [w])).get(w)).toHaveLength(1);

    // The goddess sees everything, named (the Sanctum-only admin reader).
    const admin = await whisperCommentsAdmin(w);
    expect(admin).toHaveLength(1);
    expect(admin[0]!.name).toBe("Marc");
    expect(admin[0]!.body).toContain("xylophone888");

    // Admin-only counts see it; there is no subject-facing count path at all.
    expect((await unreadCommentCountsFor([w])).get(w)).toBe(1);
    expect(await totalUnreadComments()).toBe(1);

    // B posting their OWN comment still never mixes the two threads.
    await createComment(B, w, "this is Paul, not Marc");
    const [aCard2] = await whispersForSubject(A, 3);
    const [bCard2] = await whispersForSubject(B, 3);
    expect(aCard2!.comments.map((c) => c.body).join()).toContain("xylophone888");
    expect(aCard2!.comments.map((c) => c.body).join()).not.toContain("Paul");
    expect(bCard2!.comments.map((c) => c.body).join()).toContain("Paul");
    expect(bCard2!.comments.map((c) => c.body).join()).not.toContain("xylophone888");
  });

  it("enforces the per-whisper cap with an in-voice refusal", async () => {
    const A = await makeSubject("Marc");
    const w = await makeWhisper();
    for (let i = 0; i < MAX_COMMENTS_PER_WHISPER; i++) {
      const r = await createComment(A, w, `distinct thought number ${i}`);
      expect(r.ok).toBe(true);
    }
    const over = await createComment(A, w, "one thought too many");
    expect(over).toEqual({ ok: false, reason: "full" });
    // The refusal shown is in her voice (never "limit reached").
    expect(copy.whispers.comments.full.length).toBeGreaterThan(0);
    expect(await whisperCommentsAdmin(w)).toHaveLength(MAX_COMMENTS_PER_WHISPER);
  });

  it("absorbs a rapid identical double-submit (60s dedup)", async () => {
    const A = await makeSubject("Marc");
    const w = await makeWhisper();
    const first = await createComment(A, w, "the very same words");
    const again = await createComment(A, w, "the very same words");
    expect(first.ok && again.ok).toBe(true);
    if (first.ok && again.ok) {
      expect(again.deduped).toBe(true);
      expect(again.comment.id).toBe(first.comment.id);
    }
    expect(await whisperCommentsAdmin(w)).toHaveLength(1);
  });
});

describe("F3 — her reply lands in Messages AND mirrors under the whisper", () => {
  it("marks seen on view, then reply threads a real message + shows her words to the owner", async () => {
    const A = await makeSubject("Marc");
    const w = await makeWhisper();
    await createComment(A, w, "please answer me, Goddess");
    const [comment] = await whisperCommentsAdmin(w);

    // Unheard until she meets it; viewing (mark-read) → seen.
    expect((await whispersForSubject(A, 3))[0]!.comments[0]!.state).toBe("unheard");
    await markCommentsRead(w);
    expect((await whispersForSubject(A, 3))[0]!.comments[0]!.state).toBe("seen");

    // She replies → reuse the messages send path.
    const res = await replyToComment(comment!.id, "I hear you. Kneel.");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.userId).toBe(A);

    // A REAL goddess message now sits in A's thread…
    const threadRows = await db
      .select({ id: threads.id })
      .from(threads)
      .where(eq(threads.userId, A));
    const reply = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.threadId, threadRows[0]!.id),
          eq(messages.sender, "goddess"),
        ),
      );
    expect(reply).toHaveLength(1);
    expect(reply[0]!.body).toBe("I hear you. Kneel.");

    // …and the comment is linked to it + mirrored to the owner as "replied".
    const [linked] = await db
      .select({ replyMessageId: whisperComments.replyMessageId })
      .from(whisperComments)
      .where(eq(whisperComments.id, comment!.id));
    expect(linked!.replyMessageId).toBe(reply[0]!.id);

    const aCard = (await whispersForSubject(A, 3))[0]!;
    expect(aCard.comments[0]!.state).toBe("replied");
    expect(aCard.comments[0]!.reply).toBe("I hear you. Kneel.");
  });

  it("she may take a subject's comment down (audited path)", async () => {
    const A = await makeSubject("Marc");
    const w = await makeWhisper();
    await createComment(A, w, "delete this one");
    const [comment] = await whisperCommentsAdmin(w);

    const gone = await deleteComment(comment!.id);
    expect(gone).toEqual({ ok: true, userId: A });
    expect(await whisperCommentsAdmin(w)).toHaveLength(0);
    expect((await commentsForViewer(A, [w])).get(w) ?? []).toHaveLength(0);
  });
});

describe("what a whisper's card carries", () => {
  it("keeps an image at its own proportions unless she chose a crop", async () => {
    const A = await makeSubject("Marc");
    // A portrait photo, posted as it is — the case that used to be sliced into
    // a 2.5:1 band by the card itself.
    const [tall] = await db
      .insert(whispers)
      .values({
        body: "Look at me.",
        audience: { type: "public" } as Audience,
        imageKey: "whispers/tall.jpg",
        imageW: 1080,
        imageH: 1920,
        publishedAt: new Date(),
      })
      .returning();
    const [cropped] = await db
      .insert(whispers)
      .values({
        body: "A band across the top.",
        audience: { type: "public" } as Audience,
        imageKey: "whispers/wide.jpg",
        imageFit: "wide",
        publishedAt: new Date(),
      })
      .returning();

    const byId = new Map(
      (await whispersForSubject(A, 3)).map((c) => [c.id, c]),
    );
    expect(byId.get(tall!.id)).toMatchObject({
      imageFit: "natural",
      imageW: 1080,
      imageH: 1920,
    });
    expect(byId.get(cropped!.id)!.imageFit).toBe("wide");
    // The anonymous front door reads the same picture the same way.
    const anon = (await publicWhispers()).find((c) => c.id === tall!.id)!;
    expect(anon.imageFit).toBe("natural");
    expect(anon.imageH).toBe(1920);
  });

  it("hands the attached file's own page to the card, so 'it's up' can link there", async () => {
    const A = await makeSubject("Marc");
    const [t] = await db
      .insert(tracks)
      .values({
        title: "Deeper",
        slug: "deeper",
        streamKey: "audio/deeper.mp3",
        minAccessLevel: 1,
        visibility: "published",
        publishedAt: new Date(),
      })
      .returning();
    await db.insert(whispers).values({
      body: "It's in your Library now.",
      audience: { type: "public" } as Audience,
      audioTrackId: t!.id,
      publishedAt: new Date(),
    });

    const card = (await whispersForSubject(A, 3))[0]!;
    expect(card.audio).toMatchObject({ slug: "deeper", playable: true });
  });
});
