import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { hasCoreConsent } from "@/lib/consent";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { attentionFor } from "@/lib/attention/resolve";
import { NO_ATTENTION } from "@/lib/attention/types";
import { SubjectGate } from "@/components/gate/SubjectGate";
import { Jail } from "@/components/gate/Jail";
import { PushHeal } from "@/components/gate/PushHeal";
import { IntakeGuard } from "@/components/intake/IntakeGuard";
import { InboxBell } from "@/components/inbox/InboxBell";
import { OfflineSync } from "@/components/offline/OfflineSync";
import { Moments } from "@/components/moments/Moments";
import { PresenceProvider } from "@/components/presence/PresenceProvider";
import { PresenceBand } from "@/components/presence/PresenceBand";
import { PresenceOverlay } from "@/components/presence/PresenceOverlay";
import { PresencePing } from "@/components/presence/PresencePing";
import { BottomNav, DesktopNav } from "@/components/nav/SubjectNav";
import { LiveRefresh } from "@/components/nav/LiveRefresh";
import { DesktopInvite } from "@/components/gate/DesktopInvite";
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
 *
 * F4 presence + the threshold: `PresenceProvider` polls "is she here?" once for
 * the whole shell (subjects only) and drives the band, the emerald Whispers nav
 * glow, and the arrival overlay. `PresencePing` beats for every signed-in role,
 * even behind the threshold takeover (`Jail`), which holds only mobile subjects
 * until the app is installed and her voice is allowed through.
 */
export async function SubjectShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // Defensive: callers only render this for signed-in users.
  if (!session?.user) return <>{children}</>;

  const isSubject = session.user.role === "subject";
  const [consented, meRow, attention, jailEnabled] = await Promise.all([
    hasCoreConsent(session.user.id),
    db
      .select({
        chosenName: users.chosenName,
        // Her per-subject release from the requirement, one per device kind.
        gatePhone: users.gatePhone,
        gateDesktop: users.gateDesktop,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1),
    // F5 · the red attention system — which tabs burn (whisper / task / message).
    // Subjects only; non-critical, so any failure falls back to nothing burning.
    isSubject
      ? attentionFor(session.user.id).catch(() => NO_ATTENTION)
      : Promise.resolve(NO_ATTENTION),
    getSetting("notification_jail_enabled"),
  ]);
  const intakeDone = Boolean(meRow[0]?.chosenName);

  return (
    <SubjectGate alreadyConsented={consented} jailActive={jailEnabled}>
      {/* Beats for every signed-in role, and keeps beating behind the takeover. */}
      <PresencePing />
      {/* Repairs a "granted but subscribed to nothing" device (silent, no prompt). */}
      <PushHeal />
      {/* Auto-refresh: pulls new whispers / messages / burns without a reload. */}
      <LiveRefresh />
      {/* The threshold — PHONES only; a laptop is never walled, and the
          goddess is never held. */}
      {isSubject ? (
        <Jail
          enabled={jailEnabled}
          gatePhone={meRow[0]?.gatePhone ?? true}
          gateDesktop={meRow[0]?.gateDesktop ?? true}
        />
      ) : null}
      {/* The laptop's version: an offer, dismissible, never a wall. Silenced
          for this subject if she turned their desktop ask off. */}
      {isSubject ? (
        <DesktopInvite enabled={meRow[0]?.gateDesktop ?? true} />
      ) : null}
      <IntakeGuard done={intakeDone}>
        <PresenceProvider enabled={isSubject}>
          {/* bottom padding clears the tab bar + mini player on mobile */}
          <div className="min-h-dvh pb-44 md:pb-28">
            <header
              className="sticky top-0 z-30 border-b border-line/70 bg-bg/90 backdrop-blur-md"
              style={{ paddingTop: "env(safe-area-inset-top)" }}
            >
              <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
                <Link
                  href="/library"
                  className="font-[family-name:var(--font-display)] text-xl tracking-[0.32em] text-gold"
                >
                  {copy.brand.name}
                </Link>
                <div className="flex items-center gap-6">
                  <DesktopNav attention={attention} />
                  <InboxBell />
                </div>
              </div>
            </header>
            {/* F4: the slim "She is here" band eases open under the header. */}
            <PresenceBand />
            {children}
            <OfflineSync />
            <Moments />
            {/* F4: the arrival overlay floats near the top and fades. */}
            <PresenceOverlay />
            <BottomNav attention={attention} />
          </div>
        </PresenceProvider>
      </IntakeGuard>
    </SubjectGate>
  );
}
