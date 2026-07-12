"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCollar,
  IconDescend,
  IconLibrary,
  IconSpark,
  IconSpeak,
} from "@/components/ui/icons";

/**
 * Subject navigation. Mobile: a fixed bottom tab bar (thumb-reachable,
 * safe-area aware). Desktop: a quiet letterspaced row in the header.
 * Secondary rooms (Asks, Orders, Commission, Settings) live on the You page.
 */
const TABS = [
  { href: "/library", label: "Library", icon: IconLibrary },
  { href: "/programs", label: "Trainings", icon: IconDescend },
  { href: "/whispers", label: "Whispers", icon: IconSpark },
  { href: "/messages", label: "Speak", icon: IconSpeak },
  { href: "/me", label: "You", icon: IconCollar },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/92 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto grid h-14 max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors duration-[var(--dur-med)] ${
                active ? "text-gold" : "text-text-dim/70 hover:text-text-dim"
              }`}
            >
              <Icon size={21} />
              <span className="text-[0.5625rem] tracking-[0.14em] uppercase">
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const DESKTOP_LINKS = [
  { href: "/library", label: "Library" },
  { href: "/programs", label: "Trainings" },
  { href: "/whispers", label: "Whispers" },
  { href: "/asks", label: "Asks" },
  { href: "/orders", label: "Orders" },
  { href: "/messages", label: "Speak" },
  { href: "/me", label: "You" },
];

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
      {DESKTOP_LINKS.map((l) => {
        const active = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`text-[0.6875rem] tracking-[0.2em] uppercase transition-colors duration-[var(--dur-med)] ${
              active ? "text-gold" : "text-text-dim hover:text-text"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
