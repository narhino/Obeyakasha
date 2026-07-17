import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { hasCoreConsent } from "@/lib/consent";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { pendingTaskCount } from "@/lib/orders/ops";
import { SubjectGate } from "@/components/gate/SubjectGate";
import { IntakeGuard } from "@/components/intake/IntakeGuard";
import { InboxBell } from "@/components/inbox/InboxBell";
import { OfflineSync } from "@/components/offline/OfflineSync";
import { Moments } from "@/components/moments/Moments";
import { BottomNav, DesktopNav } from "@/components/nav/SubjectNav";
import { copy } from "@/copy/copy";

/**
 * The signed-in subject chrome — header + tab nav + moment checker, gated
 * through consent and intake. It wraps EVERY subject surface so the app never
 * changes shape between tabs. Used by the `(subject)` layout AND by the Home
 * page (`/`, the Whispers feed), which lives outside the route group but must
 * wear the same shell so the Whispers tab never feels like leaving the app (F10).
 *
 * The audio engine (PlayerRoot) is intentionally NOT here — it is mounted once
 * in the root layout so playback survives crossing between `/` and the tabs
 * (the mini-player never restarts). This shell only reserves room for it.
 */
export async function SubjectShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // Defensive: callers only render this for signed-in users.
  if (!session?.user) return <>{children}</>;

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
          <OfflineSync />
          <Moments />
          <BottomNav pendingCount={pendingCount} />
        </div>
      </IntakeGuard>
    </SubjectGate>
  );
}
