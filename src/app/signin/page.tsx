import { redirect } from "next/navigation";
import { signIn, auth } from "@/auth";
import { Button, Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

export default async function SignIn() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === "goddess" ? "/sanctum" : "/library");
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div
        aria-hidden
        className="breathe pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 45%, var(--color-accent-soft) 0%, transparent 70%)",
        }}
      />
      <p className="mb-4 font-[family-name:var(--font-display)] text-5xl text-gold">
        {copy.brand.mark}
      </p>
      <Display className="text-3xl">{copy.auth.signInTitle}</Display>
      <Whisper className="mt-3 max-w-sm">{copy.auth.signInBody}</Whisper>

      <form
        className="mt-8"
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
