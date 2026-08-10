import type { Metadata } from "next";
import { PRIVATE_META } from "@/lib/seo/site";
import Image from "next/image";
import { redirect } from "next/navigation";
import { signIn, auth } from "@/auth";
import { GATE_IMAGE } from "@/lib/art/defaults";
import { Button, Display, Ornament, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

/** Not a landing page — nothing here should compete in a search result. */
export const metadata: Metadata = { ...PRIVATE_META, title: "Enter" };


export default async function SignIn() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === "goddess" ? "/sanctum" : "/library");
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Bespoke Gate backdrop (D1): parted velvet curtains, gold light through
          the gap — dimmed under a scrim so the mark and her words stay crisp. */}
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
              "radial-gradient(58% 55% at 50% 44%, color-mix(in srgb, var(--color-bg) 30%, transparent) 6%, color-mix(in srgb, var(--color-bg) 72%, transparent) 60%, var(--color-bg) 100%)",
          }}
        />
      </div>
      <div
        aria-hidden
        className="breathe pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 45%, var(--color-accent-soft) 0%, transparent 72%)",
        }}
      />
      <p className="font-[family-name:var(--font-display)] text-5xl text-gold [text-shadow:0_0_50px_rgba(212,175,106,0.3)]">
        {copy.brand.mark}
      </p>
      <Display className="mt-6 text-3xl">{copy.auth.signInTitle}</Display>
      <Ornament className="mt-5 w-40" />
      <Whisper className="mt-5 max-w-sm font-[family-name:var(--font-display)] text-base italic">
        {copy.auth.signInBody}
      </Whisper>

      <form
        className="mt-10"
        action={async () => {
          "use server";
          await signIn("patreon", { redirectTo: "/library" });
        }}
      >
        <Button type="submit" size="lg" variant="gold">
          {copy.auth.signInButton}
        </Button>
      </form>
    </main>
  );
}
