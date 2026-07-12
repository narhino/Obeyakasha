import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { Button, Card, Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * The Threshold (A18) — public funnel for YouTube arrivals. Shows the free
 * teaser tracks (ADMIN-CONFIG threshold_track_ids) and drives sign-in. Playing
 * happens after they enter (as a level-0 subject).
 */
export default async function Threshold() {
  const ids = await getSetting("threshold_track_ids");
  const free =
    ids.length > 0
      ? await db.select().from(tracks).where(inArray(tracks.id, ids))
      : [];

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
      <div
        aria-hidden
        className="breathe pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, var(--color-accent-soft) 0%, transparent 70%)",
        }}
      />
      <p className="mb-4 font-[family-name:var(--font-display)] text-5xl text-gold">
        {copy.brand.mark}
      </p>
      <Display className="text-3xl">{copy.brand.name}</Display>
      <Whisper className="mt-3 max-w-sm text-base italic">
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
    </main>
  );
}
