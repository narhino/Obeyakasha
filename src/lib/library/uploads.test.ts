import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  reviewQueue,
  tags,
  trackTags,
  tracks,
  transcripts,
  users,
} from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { organizeTrack } from "@/lib/organize/run";
import { setSetting } from "@/lib/settings";
import {
  countMyUploads,
  getAccessibleTrack,
  getSampleTrack,
  getTrackFilePage,
  listCatalogTracks,
  listMyUploads,
} from "@/lib/library/queries";
import { deleteUpload } from "@/lib/library/uploads";

let rnd = 0;
const slug = (p: string) => `${p}-${(++rnd).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

async function makeSubject(): Promise<string> {
  const [u] = await db.insert(users).values({ role: "subject" }).returning();
  return u!.id;
}
async function makeGoddess(): Promise<string> {
  const [u] = await db.insert(users).values({ role: "goddess" }).returning();
  return u!.id;
}

/** A public, level-1 catalog track (nobody's personal upload). */
async function makeCatalogTrack(title: string): Promise<string> {
  const [t] = await db
    .insert(tracks)
    .values({
      title,
      slug: slug("cat"),
      visibility: "published",
      minAccessLevel: 1,
      streamKey: `stream/${slug("s")}.m4a`,
    })
    .returning();
  return t!.id;
}

/**
 * A subject's personal upload. Deliberately created PUBLISHED + freeSample to
 * stress every D7 guard: even in the worst case where an owned track carries
 * "public-looking" flags, `notSomeoneElses` (and getAccessibleTrack/getSampleTrack)
 * must still hide it from everyone but its owner and the goddess.
 */
async function makeOwnedUpload(
  ownerUserId: string,
  opts: { title: string; transcript?: string; tag?: string } = { title: "x" },
): Promise<{ id: string; slug: string }> {
  const s = slug("mine");
  const [t] = await db
    .insert(tracks)
    .values({
      title: opts.title,
      slug: s,
      visibility: "published",
      freeSample: true,
      minAccessLevel: 1,
      source: "subject_upload",
      ownerUserId,
      streamKey: `stream/${slug("s")}.m4a`,
    })
    .returning();
  const id = t!.id;
  if (opts.transcript) {
    await db
      .insert(transcripts)
      .values({ trackId: id, status: "done", fullText: opts.transcript });
  }
  if (opts.tag) {
    const [tag] = await db
      .insert(tags)
      .values({ kind: "theme", value: opts.tag })
      .onConflictDoNothing({ target: [tags.kind, tags.value] })
      .returning();
    const tagId =
      tag?.id ??
      (
        await db
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.value, opts.tag))
          .limit(1)
      )[0]?.id;
    if (tagId) await db.insert(trackTags).values({ trackId: id, tagId });
  }
  return { id, slug: s };
}

beforeEach(async () => {
  await truncateAll();
});

describe("F1 subject uploads — D7 privacy (absolute)", () => {
  it("B cannot list, search, open, or stream A's upload; A can; anon sees none", async () => {
    const A = await makeSubject();
    const B = await makeSubject();
    const goddess = await makeGoddess();

    // A public catalog track (positive control) + A's private upload with a
    // uniquely-worded transcript and a tag.
    const catId = await makeCatalogTrack("Her public induction");
    const mine = await makeOwnedUpload(A, {
      title: "My own recording",
      transcript: "the secret word here is xylophone888 spoken softly",
      tag: "chastity",
    });

    // ── Catalog list ──────────────────────────────────────────────────────
    const bList = await listCatalogTracks({ userId: B, accessLevel: 3 });
    expect(bList.tracks.some((t) => t.id === mine.id)).toBe(false);
    expect(bList.tracks.some((t) => t.id === catId)).toBe(true); // not over-filtered

    const anonList = await listCatalogTracks({ userId: null, accessLevel: 0 });
    expect(anonList.tracks.some((t) => t.id === mine.id)).toBe(false);
    // (In the real feature a personal upload is always a draft, so it never
    // reaches the catalog at all; here it is published-owned on purpose so the
    // exclusion above proves the `notSomeoneElses` predicate — not visibility —
    // is what hides it from B and anon.)

    // ── Search, incl. by transcript text ──────────────────────────────────
    const bSearch = await listCatalogTracks(
      { userId: B, accessLevel: 3 },
      { q: "xylophone888" },
    );
    expect(bSearch.tracks.some((t) => t.id === mine.id)).toBe(false);

    const anonSearch = await listCatalogTracks(
      { userId: null, accessLevel: 0 },
      { q: "xylophone888" },
    );
    expect(anonSearch.tracks.some((t) => t.id === mine.id)).toBe(false);

    // Also by its tag value.
    const bTagSearch = await listCatalogTracks(
      { userId: B, accessLevel: 3 },
      { q: "chastity" },
    );
    expect(bTagSearch.tracks.some((t) => t.id === mine.id)).toBe(false);

    // ── The "Yours" shelf ─────────────────────────────────────────────────
    const aYours = await listMyUploads(A);
    expect(aYours.map((u) => u.id)).toContain(mine.id);
    const bYours = await listMyUploads(B);
    expect(bYours).toHaveLength(0);
    expect(await countMyUploads(A)).toBe(1);
    expect(await countMyUploads(B)).toBe(0);

    // ── File page (direct slug) ───────────────────────────────────────────
    const bPage = await getTrackFilePage(mine.slug, {
      userId: B,
      accessLevel: 3,
    });
    expect(bPage).toBeNull(); // a hard 404 upstream
    const anonPage = await getTrackFilePage(mine.slug, {
      userId: null,
      accessLevel: 0,
    });
    expect(anonPage).toBeNull();
    const aPage = await getTrackFilePage(mine.slug, {
      userId: A,
      accessLevel: 3,
    });
    expect(aPage?.track.id).toBe(mine.id); // the owner sees their own file page
    const goddessPage = await getTrackFilePage(
      mine.slug,
      { userId: goddess, accessLevel: 3 },
      { isGoddess: true },
    );
    expect(goddessPage?.track.id).toBe(mine.id);

    // ── Stream URL entitlement (before any signed URL is minted) ──────────
    expect(await getAccessibleTrack(mine.id, B, 3)).toBeNull(); // other subject
    expect(await getAccessibleTrack(mine.id, A, 0)).not.toBeNull(); // owner, any level
    expect(
      await getAccessibleTrack(mine.id, goddess, 0, { isGoddess: true }),
    ).not.toBeNull(); // the goddess

    // getSampleTrack must NEVER return an owned track, even flagged freeSample.
    expect(await getSampleTrack(mine.id)).toBeNull();
    // …but a genuine catalog free sample still works.
    await db
      .update(tracks)
      .set({ freeSample: true })
      .where(eq(tracks.id, catId));
    expect(await getSampleTrack(catId)).not.toBeNull();
  });

  it("delete removes the row; only the owner (or the goddess) may", async () => {
    const A = await makeSubject();
    const B = await makeSubject();
    const mine = await makeOwnedUpload(A, { title: "delete me" });

    // B cannot delete A's file.
    expect(await deleteUpload(mine.id, { requireOwner: B })).toEqual({
      ok: false,
      reason: "forbidden",
    });
    // The owner can.
    expect(await deleteUpload(mine.id, { requireOwner: A })).toEqual({
      ok: true,
    });
    const [gone] = await db
      .select()
      .from(tracks)
      .where(eq(tracks.id, mine.id));
    expect(gone).toBeUndefined();

    // deleteUpload refuses a catalog track (never her catalog).
    const catId = await makeCatalogTrack("not a personal upload");
    expect(await deleteUpload(catId)).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("organize skips the review queue for owned uploads and tags them anyway (even under review_all)", async () => {
    const A = await makeSubject();
    // Worst case for the guard: the goddess dial says "review everything".
    await setSetting("organize_auto_apply", "review_all");

    const mine = await makeOwnedUpload(A, {
      title: "mine",
      transcript: "you are locked in chastity now, deeper and obedient",
    });
    const catId = await makeCatalogTrack("Locked in chastity");
    await db.insert(transcripts).values({
      trackId: catId,
      status: "done",
      fullText: "you are locked in chastity now, deeper and obedient",
    });

    await organizeTrack(mine.id);
    await organizeTrack(catId);

    // Owned upload: NEVER lands in the goddess review queue …
    const ownedReviews = await db
      .select()
      .from(reviewQueue)
      .where(eq(reviewQueue.status, "pending"));
    expect(
      ownedReviews.some(
        (r) => (r.subjectRef as { trackId?: string } | null)?.trackId === mine.id,
      ),
    ).toBe(false);
    // … yet its tags auto-applied regardless of the review_all dial.
    const ownedTags = await db
      .select()
      .from(trackTags)
      .where(eq(trackTags.trackId, mine.id));
    expect(ownedTags.length).toBeGreaterThan(0);

    // Her own catalog track under review_all does the opposite: a pending review
    // row, and nothing auto-applied.
    const catReview = ownedReviews.find(
      (r) => (r.subjectRef as { trackId?: string } | null)?.trackId === catId,
    );
    expect(catReview).toBeTruthy();
    const catTags = await db
      .select()
      .from(trackTags)
      .where(and(eq(trackTags.trackId, catId)));
    expect(catTags.length).toBe(0);
  });
});
