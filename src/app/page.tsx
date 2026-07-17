import Link from "next/link";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { isCollared } from "@/lib/oath/resolve";
import {
  publicWhispers,
  whispersForSubject,
  type WhisperCard,
} from "@/lib/feed/whispers";
import { WhispersFeed } from "@/components/whispers/WhispersFeed";
import { SubjectShell } from "@/components/nav/SubjectShell";
import { Button, Display, Ornament, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

// Reads the session + DB per request; never prerender at build.
export const dynamic = "force-dynamic";

/**
 * Home = the Whispers feed (R1). The public front door.
 * - Logged-out: public-audience whispers only, pinned first, + Enter CTA, in
 *   the front-door shell (breathing hero, ornament, no app nav).
 * - Signed-in subject: their level-filtered feed inside the SAME subject shell
 *   as every tab (header + bottom nav + mini-player), Whispers tab active (F10).
 * The feed is one-way — subjects never post.
 */
export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user);

  let items: WhisperCard[];
  if (!session?.user) {
    items = await publicWhispers();
  } else if (session.user.role === "goddess") {
    // She sees everything in her own feed — collared audience included.
    items = await whispersForSubject(session.user.id, 999, true);
  } else {
    const [access, collared] = await Promise.all([
      resolveAccess(session.user.id),
      isCollared(session.user.id),
    ]);
    items = await whispersForSubject(
      session.user.id,
      access.accessLevel,
      collared,
    );
  }

  // ── Signed-in: live inside the app chrome (Whispers tab active) ──
  if (signedIn) {
    return (
      <SubjectShell>
        <main className="mx-auto max-w-2xl px-4 pt-8">
          <Display className="text-3xl">{copy.whispers.title}</Display>
          <WhispersFeed items={items} signedIn />
        </main>
      </SubjectShell>
    );
  }

  // ── Anonymous: the public front door (unchanged look) ──
  return (
    <main className="relative mx-auto min-h-dvh max-w-2xl px-4 pb-20">
      <div
        aria-hidden
        className="breathe pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, var(--color-accent-soft) 0%, transparent 72%)",
        }}
      />

      <header className="sticky top-0 z-30 -mx-4 border-b border-line/70 bg-bg/85 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl tracking-[0.3em] text-gold"
          >
            {copy.brand.name}
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/about"
              className="text-[0.6875rem] tracking-[0.2em] uppercase text-text-dim transition-colors duration-[var(--dur-med)] hover:text-text"
            >
              {copy.home.aboutLink}
            </Link>
            <Link href="/signin">
              <Button size="sm" variant="gold">
                {copy.auth.signInButton}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="pt-8">
        <Display className="text-3xl">{copy.whispers.title}</Display>
        <Ornament className="mt-4 w-40" />
        <Whisper className="mt-4 max-w-md font-[family-name:var(--font-display)] text-base italic leading-relaxed">
          {copy.home.publicIntro}
        </Whisper>
        <WhispersFeed items={items} signedIn={false} />
      </section>
    </main>
  );
}
