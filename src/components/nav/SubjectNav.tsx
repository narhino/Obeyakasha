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
import { NO_ATTENTION, type Attention } from "@/lib/attention/types";
import { copy } from "@/copy/copy";

/**
 * Subject navigation — the v2 IA's five tabs (ROADMAP-v1.5): Home (whispers),
 * Library, Tasks, Messages, You. Mobile: a fixed bottom tab bar (thumb-
 * reachable, safe-area aware). Desktop: a quiet letterspaced row in the header.
 *
 * F5 · the red attention system: a strong red burn on any tab that holds
 * something needing the subject now — a new whisper, a task owed, her unread
 * word. It replaces the old lone Tasks danger dot (one treatment, not two). On
 * the Whispers tab red OVERRIDES the F4 emerald presence glow — green shows only
 * when nothing burns. A tab's burn is suppressed while it's the active tab (you
 * are already there); visiting it clears the burn for good (server marks seen).
 */
const TABS = [
  { href: "/", label: copy.nav.home, icon: IconSpark },
  { href: "/library", label: copy.nav.library, icon: IconLibrary },
  { href: "/orders", label: copy.nav.tasks, icon: IconTask },
  { href: "/messages", label: copy.nav.messages, icon: IconSpeak },
  { href: "/me", label: copy.nav.you, icon: IconCollar },
] as const;

// Secondary rooms reached from the You page — they carry no tab of their own,
// so the You tab stays lit while you're inside them, keeping the anchor (F21).
// (/settings is gone in F5, redirecting to /me — no longer listed here.)
const YOU_ROOMS = ["/me", "/commissions", "/asks"];

/** Home (`/`) matches exactly; the You tab also owns its secondary rooms. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/me")
    return YOU_ROOMS.some(
      (r) => pathname === r || pathname.startsWith(`${r}/`),
    );
  return pathname.startsWith(href);
}

/** Does this tab hold something that needs the subject right now? */
function burnsFor(href: string, a: Attention): boolean {
  if (href === "/") return a.whispers;
  if (href === "/orders") return a.tasks > 0;
  if (href === "/messages") return a.messages;
  return false;
}

/** In-voice screen-reader announcement for a burning tab. */
function burnLabel(href: string): string {
  if (href === "/") return copy.nav.burnWhispers;
  if (href === "/orders") return copy.nav.pending;
  if (href === "/messages") return copy.nav.burnMessages;
  return "";
}

type Tone = "burn" | "presence" | "active" | "idle";

/** Priority: burn (red) > presence (green, Whispers only) > active (gold) > idle. */
function toneFor(
  href: string,
  active: boolean,
  online: boolean,
  attention: Attention,
): Tone {
  // A burn only shows while the tab is NOT the one you're on (visiting clears it).
  if (!active && burnsFor(href, attention)) return "burn";
  if (href === "/" && online) return "presence";
  if (active) return "active";
  return "idle";
}

export function BottomNav({
  attention = NO_ATTENTION,
}: {
  attention?: Attention;
}) {
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
          const tone = toneFor(t.href, active, online, attention);
          const Icon = t.icon;
          const textColor =
            tone === "burn"
              ? "text-attention"
              : tone === "presence"
                ? "text-presence"
                : tone === "active"
                  ? "text-gold"
                  : "text-text-dim/70 hover:text-text-dim";
          const iconGlow =
            tone === "burn" ? "burns" : tone === "presence" ? "presence-lit" : "";
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors duration-[var(--dur-med)] ${textColor}`}
            >
              <span className={`relative ${iconGlow}`}>
                <Icon size={21} />
              </span>
              <span className="text-[0.5625rem] tracking-[0.14em] uppercase">
                {t.label}
              </span>
              {tone === "burn" ? (
                <span className="sr-only">{burnLabel(t.href)}</span>
              ) : tone === "presence" ? (
                <span className="sr-only">{copy.presence.band}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DesktopNav({
  attention = NO_ATTENTION,
}: {
  attention?: Attention;
}) {
  const pathname = usePathname();
  // F4: the Whispers tab glows emerald while she's on the app (owner's colour).
  const { online } = usePresence();
  return (
    <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        const tone = toneFor(t.href, active, online, attention);
        const toneClass =
          tone === "burn"
            ? "burns"
            : tone === "presence"
              ? "presence-lit"
              : tone === "active"
                ? "text-gold"
                : "text-text-dim hover:text-text";
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`relative text-[0.6875rem] tracking-[0.2em] uppercase transition-colors duration-[var(--dur-med)] ${toneClass}`}
          >
            {t.label}
            {tone === "burn" ? (
              <span className="sr-only">{burnLabel(t.href)}</span>
            ) : tone === "presence" ? (
              <span className="sr-only">{copy.presence.band}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
