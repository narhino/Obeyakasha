import type { Metadata } from "next";
import { publicMeta } from "@/lib/seo/site";
import Link from "next/link";
import { Button, Ornament, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

export const metadata: Metadata = publicMeta({
  title: copy.seo.aboutTitle,
  description: copy.seo.aboutDescription,
  path: "/about",
});

/**
 * The threshold stone — the theatrical landing. Moved here from `/` in R1 so
 * the root can become the Whispers feed; linked from the feed header.
 */
export default function About() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* candle vignette */}
      <div
        aria-hidden
        className="breathe pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(58% 46% at 50% 42%, var(--color-accent-soft) 0%, transparent 72%)",
        }}
      />
      {/* the slow wheel — a faint spoked disc, one turn every four minutes */}
      <div
        aria-hidden
        className="turn-slow pointer-events-none absolute left-1/2 top-[42%] -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.16]"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, transparent 0deg 9deg, var(--color-gold) 9deg 9.6deg, transparent 9.6deg 18deg)",
          maskImage:
            "radial-gradient(circle, transparent 30%, black 46%, transparent 68%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 30%, black 46%, transparent 68%)",
        }}
      />

      <p className="font-[family-name:var(--font-display)] text-7xl font-medium text-gold [text-shadow:0_0_60px_rgba(212,175,106,0.35)]">
        {copy.brand.mark}
      </p>

      <h1 className="mt-5 font-[family-name:var(--font-display)] text-[2.6rem] font-medium tracking-[0.38em] text-text sm:text-5xl">
        {copy.brand.name}
      </h1>

      <Ornament className="mt-6 w-52" />

      <Whisper className="mt-6 max-w-md font-[family-name:var(--font-display)] text-lg italic leading-relaxed">
        {copy.brand.tagline}
      </Whisper>

      <Link href="/signin" className="mt-12">
        <Button size="lg" variant="gold">
          {copy.auth.signInButton}
        </Button>
      </Link>

      <footer
        className="absolute inset-x-0 bottom-0 flex justify-center gap-6 pb-6 text-[0.625rem] tracking-[0.2em] uppercase text-text-dim/50"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <Link href="/terms" className="transition-colors hover:text-text-dim">
          Terms
        </Link>
        <Link href="/privacy" className="transition-colors hover:text-text-dim">
          Privacy
        </Link>
        <span>18+</span>
      </footer>
    </main>
  );
}
