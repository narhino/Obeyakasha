"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCollar,
  IconLibrary,
  IconSpark,
  IconSpeak,
  IconTask,
} from "@/components/ui/icons";
import { usePresence } from "@/components/presence/PresenceProvider";
import { copy } from "@/copy/copy";

/**
 * Subject navigation — the v2 IA's five tabs (ROADMAP-v1.5): Home (whispers),
 * Library, Tasks, Messages, You. Mobile: a fixed bottom tab bar (thumb-
 * reachable, safe-area aware). Desktop: a quiet letterspaced row in the header.
 * The Tasks tab carries a danger pulse while the subject owes anything.
 * Secondary rooms (Asks, Commission, Settings) live on the You page.
 */
const TABS = [
  { href: "/", label: copy.nav.home, icon: IconSpark },
  { href: "/library", label: copy.nav.library, icon: IconLibrary },
  { href: "/orders", label: copy.nav.tasks, icon: IconTask, alert: true },
  { href: "/messages", label: copy.nav.messages, icon: IconSpeak },
  { href: "/me", label: copy.nav.you, icon: IconCollar },
] as const;

// Secondary rooms reached from the You page — they carry no tab of their own,
// so the You tab stays lit while you're inside them, keeping the anchor (F21).
const YOU_ROOMS = ["/me", "/settings", "/commissions", "/asks"];

/** Home (`/`) matches exactly; the You tab also owns its secondary rooms. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/me")
    return YOU_ROOMS.some(
      (r) => pathname === r || pathname.startsWith(`${r}/`),
    );
  return pathname.startsWith(href);
}

/** Danger dot for the Tasks tab: pulses (steady when reduced-motion). */
function AlertDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`pulse-alert pointer-events-none block h-2 w-2 rounded-full bg-danger ${className}`}
    />
  );
}

export function BottomNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  // F4: the Whispers tab glows emerald while she's on the app (owner's colour).
  const { online } = usePresence();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/92 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto grid h-14 max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const active = isActive(pathname, t.href);
          const Icon = t.icon;
          const showAlert = "alert" in t && t.alert && pendingCount > 0;
          const lit = t.href === "/" && online;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors duration-[var(--dur-med)] ${
                lit
                  ? "text-presence"
                  : active
                    ? "text-gold"
                    : "text-text-dim/70 hover:text-text-dim"
              }`}
            >
              <span className={`relative ${lit ? "presence-lit" : ""}`}>
                <Icon size={21} />
                {showAlert ? <AlertDot className="absolute -top-1 -right-2" /> : null}
              </span>
              <span className="text-[0.5625rem] tracking-[0.14em] uppercase">
                {t.label}
              </span>
              {lit ? <span className="sr-only">{copy.presence.band}</span> : null}
              {showAlert ? <span className="sr-only">{copy.nav.pending}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DesktopNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  // F4: the Whispers tab glows emerald while she's on the app (owner's colour).
  const { online } = usePresence();
  return (
    <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        const showAlert = "alert" in t && t.alert && pendingCount > 0;
        const lit = t.href === "/" && online;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative text-[0.6875rem] tracking-[0.2em] uppercase transition-colors duration-[var(--dur-med)] ${
              lit
                ? "presence-lit"
                : active
                  ? "text-gold"
                  : "text-text-dim hover:text-text"
            }`}
          >
            {t.label}
            {lit ? <span className="sr-only">{copy.presence.band}</span> : null}
            {showAlert ? (
              <>
                <AlertDot className="absolute -top-0.5 -right-2.5" />
                <span className="sr-only">{copy.nav.pending}</span>
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
