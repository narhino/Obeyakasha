import type { Metadata } from "next";
import { publicMeta } from "@/lib/seo/site";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { isCollared } from "@/lib/oath/resolve";
import {
  publicWhispers,
  whispersForSubject,
  type WhisperCard,
} from "@/lib/feed/whispers";
import { HERO_IMAGE } from "@/lib/art/defaults";
import { getRawSetting } from "@/lib/settings";
import { WhispersFeed } from "@/components/whispers/WhispersFeed";
import { SiteJsonLd } from "@/components/seo/JsonLd";
import { WhispersSeen } from "@/components/whispers/WhispersSeen";
import { SubjectShell } from "@/components/nav/SubjectShell";
import {
  Button,
  Card,
  Display,
  Eyebrow,
  Voice,
  Whisper,
} from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * The front door for anyone who has never heard of her. This is the page a
 * search result points at, so it carries the plainest description on the site.
 */
export const metadata: Metadata = publicMeta({
  title: copy.seo.homeTitle,
  description: copy.seo.homeDescription,
  path: "/",
});

// Reads the session + DB per request; never prerender at build.
export const dynamic = "force-dynamic";

/**
 * Home = the Whispers feed (R1). The public front door.
 * - Logged-out: a full-bleed cinematic hero (hero.jpg, gold scrim, the mark huge
 *   in the display serif) over the public-audience feed + Enter CTA.
 * - Signed-in subject: the SAME subject shell as every tab, opening on a slimmer
 *   hero band, Whispers tab active (F10).
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
        <main className="mx-auto max-w-2xl px-4 pt-6">
          {/* Slim hero band — the same veiled presence, a quieter register. */}
          <section className="relative -mx-4 h-40 overflow-hidden sm:h-48">
            <Image
              src={HERO_IMAGE}
              alt=""
              fill
              priority
              sizes="(max-width: 640px) 100vw, 42rem"
              className="object-cover object-[62%_30%] sm:object-[50%_28%]"
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, var(--color-bg), color-mix(in srgb, var(--color-bg) 30%, transparent) 45%, transparent 82%)",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
              <Eyebrow className="text-gold/80">{copy.brand.mark}</Eyebrow>
              <Display size="opener" className="mt-1">
                {copy.whispers.title}
              </Display>
            </div>
          </section>
          <WhispersFeed items={items} signedIn />
          {/* F5: opening the feed marks it seen — clears the Whispers tab burn. */}
          {session?.user?.role === "subject" ? <WhispersSeen /> : null}
        </main>
      </SubjectShell>
    );
  }

  // ── Anonymous: the public front door ──
  // Her Patreon is the one external profile worth declaring as the same
  // entity — it tells a search engine the two pages are one person rather
  // than two competing results.
  const patreonPageUrl = await getRawSetting<string>(
    "patreon_page_url",
    "https://www.patreon.com",
  );
  return (
    <main className="relative min-h-dvh pb-24">
      {/* Who she is and what this site is, once, on the only page a stranger
          reliably lands on. Built from her own brand strings — no subject and
          no count of subjects appears here (D7). */}
      <SiteJsonLd patreonUrl={patreonPageUrl} />
      <header
        className="sticky top-0 z-30 border-b border-line/40 bg-bg/60 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl tracking-[0.3em] text-gold"
          >
            {copy.brand.name}
          </Link>
          <div className="flex items-center gap-4">
            {/* Without this a visitor has no route to the catalogue at all —
                the free samples would never be found. */}
            <Link
              href="/library"
              className="text-[0.6875rem] tracking-[0.2em] uppercase text-text-dim transition-colors duration-[var(--dur-med)] hover:text-text"
            >
              {copy.home.catalogueLink}
            </Link>
            <Link
              href="/about"
              className="hidden text-[0.6875rem] tracking-[0.2em] uppercase text-text-dim transition-colors duration-[var(--dur-med)] hover:text-text sm:inline"
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

      {/* Full-bleed cinematic opener — hero.jpg under a header that floats over
          its top edge, the mark set huge, her tagline beneath in-voice. Height
          is inline (deterministic layout, independent of class generation). */}
      <section
        className="relative w-full overflow-hidden"
        style={{ height: "80vh", minHeight: "30rem", marginTop: "-3.75rem" }}
      >
        <Image
          src={HERO_IMAGE}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[64%_36%] sm:object-[50%_32%]"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in srgb, var(--color-bg) 50%, transparent), transparent 26%, transparent 40%, color-mix(in srgb, var(--color-bg) 82%, transparent) 84%, var(--color-bg))",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(78% 52% at 50% 104%, color-mix(in srgb, var(--color-gold) 22%, transparent), transparent 62%)",
          }}
        />
        <div className="enter absolute inset-x-0 bottom-0 mx-auto max-w-2xl px-4 pb-10">
          <Eyebrow className="text-gold/85">{copy.brand.mark}</Eyebrow>
          <Display
            as="h1"
            className="mt-3 text-[clamp(2.75rem,13vw,5.75rem)] leading-[0.98] tracking-[0.16em]"
          >
            {copy.brand.name}
          </Display>
          <Voice className="mt-4 max-w-md leading-relaxed text-text/85">
            {copy.brand.tagline}
          </Voice>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4">
        <div className="mt-10 flex items-end justify-between gap-4">
          <Display size="section" as="h2">
            {copy.whispers.title}
          </Display>
          <Link href="/signin">
            <Button size="sm" variant="ghost">
              {copy.auth.signInButton}
            </Button>
          </Link>
        </div>
        <Voice className="mt-3 max-w-md">{copy.home.publicIntro}</Voice>
        <WhispersFeed items={items} signedIn={false} />

        {/* The way in for someone who hasn't committed yet. The feed is empty
            until she publishes a public whisper, so without this the front
            door offers a stranger nothing but a sign-in button. */}
        <Card className="enter mt-10 text-center" raised>
          <Eyebrow className="text-gold/80">{copy.home.tasteTitle}</Eyebrow>
          <Voice className="mx-auto mt-3 max-w-md">
            {copy.home.tasteBody}
          </Voice>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/library">
              <Button variant="gold">{copy.home.tasteCta}</Button>
            </Link>
            {/* Commissions take guests now (email, no account) — but nothing
                pointed here, so the request form was unreachable. */}
            <Link href="/commissions">
              <Button variant="ghost">{copy.home.commissionCta}</Button>
            </Link>
          </div>
          <Whisper className="mt-3 text-xs">
            {copy.home.commissionHint}
          </Whisper>
        </Card>
      </section>
    </main>
  );
}
