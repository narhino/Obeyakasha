import Link from "next/link";
import { auth } from "@/auth";
import { SubjectShell } from "@/components/nav/SubjectShell";
import { Button } from "@/components/ui";
import { copy } from "@/copy/copy";

export default async function SubjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Anonymous browsing (R2a public catalog). Only /library and its subroutes
  // land here — middleware still gates every other subject prefix to a
  // session. No gate/intake/player; a slim header that funnels to Enter.
  if (!session?.user) {
    return (
      <div className="min-h-dvh pb-20">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link
              href="/"
              className="font-[family-name:var(--font-display)] text-xl tracking-[0.32em] text-gold"
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
        {children}
      </div>
    );
  }

  return <SubjectShell>{children}</SubjectShell>;
}
