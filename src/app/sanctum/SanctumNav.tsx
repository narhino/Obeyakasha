"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Counts surfaced as small gold dots on the rail (fail-soft, computed in the
 *  layout server component). Keyed by nav item, not by route. */
export interface NavCounts {
  today: number;
  review: number;
  messages: number;
  tasks: number;
  /** F1: how many personal files subjects have brought (fail-soft). */
  theirFiles: number;
  /** F3: unread comments spoken under her whispers (fail-soft). */
  comments: number;
}

type BadgeKey = keyof NavCounts;

interface NavItem {
  href: string;
  label: string;
  badge?: BadgeKey;
}
interface NavGroup {
  /** null → no header (the standalone Today entry). */
  label: string | null;
  items: NavItem[];
}

// The six-group IA (R-organize). 15 destinations; Live/Import/Series/Programs/
// Polls are reachable but no longer flat tabs.
const GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/sanctum", label: "Today", badge: "today" }] },
  {
    label: "Catalog",
    items: [
      { href: "/sanctum/library", label: "Library" },
      { href: "/sanctum/collections", label: "Collections" },
      { href: "/sanctum/organize", label: "Review", badge: "review" },
      { href: "/sanctum/their-files", label: "Their files", badge: "theirFiles" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/sanctum/subjects", label: "Subjects" },
      { href: "/sanctum/messages", label: "Messages", badge: "messages" },
    ],
  },
  {
    label: "Voice",
    items: [
      { href: "/sanctum/whispers", label: "Whispers", badge: "comments" },
      { href: "/sanctum/broadcast", label: "Broadcast" },
      { href: "/sanctum/questions", label: "Questions" },
    ],
  },
  {
    label: "Duties",
    items: [
      { href: "/sanctum/orders", label: "Tasks", badge: "tasks" },
      { href: "/sanctum/commissions", label: "Commissions" },
      { href: "/sanctum/wishes", label: "Asks" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/sanctum/analytics", label: "Analytics" },
      { href: "/sanctum/access", label: "Settings" },
      { href: "/sanctum/audit", label: "Audit" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/sanctum") return pathname === "/sanctum";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Small gold count dot — only rendered when > 0. */
function CountDot({ n }: { n: number }) {
  return (
    <span className="nums-lining ml-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full border border-gold/40 bg-gold/15 px-1 py-0.5 text-[0.625rem] leading-none tracking-normal text-gold">
      {n}
    </span>
  );
}

function NavLink({
  item,
  counts,
  active,
}: {
  item: NavItem;
  counts: NavCounts;
  active: boolean;
}) {
  const n = item.badge ? counts[item.badge] : 0;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex shrink-0 items-center whitespace-nowrap rounded-[var(--radius)] px-3 py-1.5 text-[0.75rem] tracking-[0.1em] uppercase transition-colors duration-[var(--dur-med)] md:py-2 ${
        active
          ? "bg-surface-raised text-gold"
          : "text-text-dim hover:bg-surface-raised hover:text-text"
      }`}
    >
      {item.label}
      {n > 0 ? <CountDot n={n} /> : null}
    </Link>
  );
}

/**
 * The Sanctum rail. Desktop: a labelled sidebar (letterspaced group captions,
 * gold active state). Mobile: one horizontal scrollable rail, grouped with
 * hairline dividers, the right-edge fade signalling more past the fold.
 */
export function SanctumNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();

  return (
    <div className="relative -mx-5 mt-5 md:mx-0 md:mt-7">
      {/* Mobile: single horizontal rail, groups split by hairline dividers. */}
      <nav className="flex items-center gap-1 overflow-x-auto px-5 pb-1 md:hidden">
        {GROUPS.map((g, gi) => (
          <div key={g.label ?? "today"} className="flex items-center gap-1">
            {gi > 0 ? (
              <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line/70" />
            ) : null}
            {g.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                counts={counts}
                active={isActive(pathname, item.href)}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Desktop: labelled column. */}
      <nav className="hidden md:flex md:flex-col md:gap-0.5">
        {GROUPS.map((g) => (
          <div key={g.label ?? "today"} className={g.label ? "mt-4 first:mt-0" : ""}>
            {g.label ? (
              <p className="label-caps px-3 pb-1 text-text-dim/60">{g.label}</p>
            ) : null}
            {g.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                counts={counts}
                active={isActive(pathname, item.href)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface to-transparent md:hidden"
      />
    </div>
  );
}
