import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { hasCoreConsent } from "@/lib/consent";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { pendingTaskCount } from "@/lib/orders/ops";
import { PlayerRoot } from "@/components/player/PlayerRoot";
import { SubjectGate } from "@/components/gate/SubjectGate";
import { IntakeGuard } from "@/components/intake/IntakeGuard";
import { InboxBell } from "@/components/inbox/InboxBell";
import { OfflineSync } from "@/components/offline/OfflineSync";
import { Moments } from "@/components/moments/Moments";
import { BottomNav, DesktopNav } from "@/components/nav/SubjectNav";
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

  const consented = await hasCoreConsent(session.user.id);
  const [me] = await db
    .select({ chosenName: users.chosenName })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const intakeDone = Boolean(me?.chosenName);
  // Drives the danger pulse on the Tasks tab; non-critical, so failures are 0.
  const pendingCount = await pendingTaskCount(session.user.id).catch(() => 0);

  return (
    <SubjectGate alreadyConsented={consented}>
      <IntakeGuard done={intakeDone}>
        {/* bottom padding clears the tab bar + mini player on mobile */}
        <div className="min-h-dvh pb-44 md:pb-28">
          <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/90 backdrop-blur-md">
            <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
              <Link
                href="/library"
                className="font-[family-name:var(--font-display)] text-xl tracking-[0.32em] text-gold"
              >
                {copy.brand.name}
              </Link>
              <div className="flex items-center gap-6">
                <DesktopNav pendingCount={pendingCount} />
                <InboxBell />
              </div>
            </div>
          </header>
          {children}
          <PlayerRoot />
          <OfflineSync />
          <Moments />
          <BottomNav pendingCount={pendingCount} />
        </div>
      </IntakeGuard>
    </SubjectGate>
  );
}
