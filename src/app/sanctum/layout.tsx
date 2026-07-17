import Link from "next/link";
import { requireGoddess } from "@/lib/auth-helpers";
import { signOut } from "@/auth";

const nav = [
  { href: "/sanctum", label: "Today" },
  { href: "/sanctum/messages", label: "Messages" },
  { href: "/sanctum/subjects", label: "Subjects" },
  { href: "/sanctum/library", label: "Library" },
  { href: "/sanctum/import", label: "Import" },
  { href: "/sanctum/organize", label: "Organize" },
  { href: "/sanctum/programs", label: "Programs" },
  { href: "/sanctum/series", label: "Series" },
  { href: "/sanctum/commissions", label: "Commissions" },
  { href: "/sanctum/wishes", label: "Wishes" },
  { href: "/sanctum/broadcast", label: "Broadcast" },
  { href: "/sanctum/whispers", label: "Whispers" },
  { href: "/sanctum/polls", label: "Polls" },
  { href: "/sanctum/questions", label: "Questions" },
  { href: "/sanctum/orders", label: "Orders" },
  { href: "/sanctum/analytics", label: "Analytics" },
  { href: "/sanctum/access", label: "Access" },
  { href: "/sanctum/audit", label: "Audit" },
];

export default async function SanctumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireGoddess();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[230px_1fr]">
      <aside className="border-b border-line/70 bg-surface md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="p-5 md:p-6">
          <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.3em] text-text-dim">
            888
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-medium text-gold">
            The Sanctum
          </p>

          {/* Mobile: horizontally scrollable rail. Desktop: column. */}
          <nav className="-mx-5 mt-5 flex gap-1 overflow-x-auto px-5 pb-1 md:mx-0 md:mt-7 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="shrink-0 whitespace-nowrap rounded-[var(--radius)] px-3 py-1.5 text-[0.75rem] tracking-[0.1em] uppercase text-text-dim transition-colors duration-[var(--dur-med)] hover:bg-surface-raised hover:text-text md:py-2"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <form
            className="mt-6 hidden md:block"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="text-[0.6875rem] tracking-[0.14em] uppercase text-text-dim/50 transition-colors hover:text-text-dim">
              Step out
            </button>
          </form>
        </div>
      </aside>
      <main className="p-5 md:p-10">{children}</main>
    </div>
  );
}
