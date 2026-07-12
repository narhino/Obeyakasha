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
import { copy } from "@/copy/copy";

const nav = [
  { href: "/library", label: copy.library.title },
  { href: "/programs", label: "Trainings" },
  { href: "/whispers", label: "Whispers" },
  { href: "/asks", label: "Asks" },
  { href: "/orders", label: "Orders" },
  { href: "/messages", label: "Speak" },
  { href: "/commissions", label: "Commission" },
  { href: "/me", label: "You" },
];

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
      <div className="min-h-dvh pb-24">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link
              href="/library"
              className="font-[family-name:var(--font-display)] text-xl text-gold"
            >
              {copy.brand.name}
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-text-dim hover:text-text"
                >
                  {n.label}
                </Link>
              ))}
              <InboxBell />
            </nav>
          </div>
        </header>
        {children}
        <PlayerRoot />
        <OfflineSync />
      </div>
      </IntakeGuard>
    </SubjectGate>
  );
}
