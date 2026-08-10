import type { Metadata } from "next";
import { PRIVATE_META } from "@/lib/seo/site";
import Image from "next/image";
import Link from "next/link";
import { and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { notSomeoneElses } from "@/lib/library/queries";
import { getSetting } from "@/lib/settings";
import { GATE_IMAGE } from "@/lib/art/defaults";
import { Button, Card, Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

/** Not a landing page — nothing here should compete in a search result. */
export const metadata: Metadata = { ...PRIVATE_META, title: "The Threshold" };


// Reads a DB setting → must not be prerendered at build (no DB then).
export const dynamic = "force-dynamic";

/**
 * The Threshold (A18) — public funnel for YouTube arrivals. Shows the free
 * teaser tracks (ADMIN-CONFIG threshold_track_ids) and drives sign-in. Playing
 * happens after they enter (as a level-0 subject).
 */
export default async function Threshold() {
  const ids = await getSetting("threshold_track_ids");
  const free =
    ids.length > 0
      ? await db
          .select()
          .from(tracks)
          // D7: the public funnel is her catalog only — never a personal upload.
          .where(and(inArray(tracks.id, ids), notSomeoneElses(null)))
      : [];

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
      {/* Bespoke Gate backdrop (D1): parted velvet curtains, gold light through
          the gap — the threshold made literal, dimmed so the words stay crisp. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20">
        <Image
          src={GATE_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-45"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(58% 55% at 50% 42%, color-mix(in srgb, var(--color-bg) 30%, transparent) 6%, color-mix(in srgb, var(--color-bg) 72%, transparent) 60%, var(--color-bg) 100%)",
          }}
        />
      </div>
      <div
        aria-hidden
        className="breathe pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, var(--color-accent-soft) 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto flex w-full max-w-xl flex-col items-center">
      <p className="mb-4 font-[family-name:var(--font-display)] text-6xl text-gold [text-shadow:0_0_50px_rgba(212,175,106,0.3)]">
        {copy.brand.mark}
      </p>
      <Display className="text-3xl tracking-[0.3em]">{copy.brand.name}</Display>
      <Whisper className="mt-4 max-w-sm font-[family-name:var(--font-display)] text-base italic">
        {copy.brand.tagline}
      </Whisper>

      {free.length > 0 ? (
        <div className="mt-8 w-full space-y-2">
          <Whisper className="text-xs uppercase tracking-wide">
            Taste what I do
          </Whisper>
          {free.map((t) => (
            <Card key={t.id} className="py-3 text-left">
              <p className="text-sm text-text">{t.title}</p>
            </Card>
          ))}
        </div>
      ) : null}

      <Link href="/signin" className="mt-10">
        <Button size="lg" variant="gold">
          {copy.auth.signInButton}
        </Button>
      </Link>
      <Whisper className="mt-3 text-xs">
        Free to enter. Deeper rooms open with membership.
      </Whisper>
      </div>
    </main>
  );
}
