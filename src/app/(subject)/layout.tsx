import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireSubject } from "@/lib/auth-helpers";
import { hasCoreConsent } from "@/lib/consent";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { PlayerRoot } from "@/components/player/PlayerRoot";
import { SubjectGate } from "@/components/gate/SubjectGate";
import { IntakeGuard } from "@/components/intake/IntakeGuard";
import { InboxBell } from "@/components/inbox/InboxBell";
import { OfflineSync } from "@/components/offline/OfflineSync";
import { BottomNav, DesktopNav } from "@/components/nav/SubjectNav";
import { copy } from "@/copy/copy";

export default async function SubjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSubject();
  const consented = await hasCoreConsent(session.user.id);
  const [me] = await db
    .select({ chosenName: users.chosenName })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const intakeDone = Boolean(me?.chosenName);

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
                <DesktopNav />
                <InboxBell />
              </div>
            </div>
          </header>
          {children}
          <PlayerRoot />
          <OfflineSync />
          <BottomNav />
        </div>
      </IntakeGuard>
    </SubjectGate>
  );
}
