import Link from "next/link";
import { Button, Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

export default function Landing() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div
        aria-hidden
        className="breathe pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, var(--color-accent-soft) 0%, transparent 70%)",
        }}
      />
      <p className="mb-6 font-[family-name:var(--font-display)] text-6xl text-gold">
        {copy.brand.mark}
      </p>
      <Display className="text-4xl sm:text-5xl">{copy.brand.name}</Display>
      <Whisper className="mt-4 max-w-md text-base italic">
        {copy.brand.tagline}
      </Whisper>
      <Link href="/signin" className="mt-10">
        <Button size="lg" variant="gold">
          {copy.auth.signInButton}
        </Button>
      </Link>
      <footer className="absolute bottom-6 flex gap-4 text-xs text-text-dim/60">
        <Link href="/terms" className="hover:text-text-dim">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-text-dim">
          Privacy
        </Link>
        <span>18+</span>
      </footer>
    </main>
  );
}
