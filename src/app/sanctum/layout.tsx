import Link from "next/link";
import { requireGoddess } from "@/lib/auth-helpers";
import { signOut } from "@/auth";
import { Display } from "@/components/ui";

const nav = [
  { href: "/sanctum", label: "Today" },
  { href: "/sanctum/messages", label: "Messages" },
  { href: "/sanctum/subjects", label: "Subjects" },
  { href: "/sanctum/library", label: "Library" },
  { href: "/sanctum/organize", label: "Organize" },
  { href: "/sanctum/programs", label: "Programs" },
  { href: "/sanctum/broadcast", label: "Broadcast" },
  { href: "/sanctum/whispers", label: "Whispers" },
  { href: "/sanctum/polls", label: "Polls" },
  { href: "/sanctum/questions", label: "Questions" },
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
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-surface p-5 md:border-b-0 md:border-r">
        <Display className="text-2xl text-gold">The Sanctum</Display>
        <nav className="mt-6 flex flex-wrap gap-2 md:flex-col">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-[var(--radius)] px-3 py-2 text-sm text-text-dim transition-colors hover:bg-surface-raised hover:text-text"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="text-xs text-text-dim/70 hover:text-text-dim">
            Step out
          </button>
        </form>
      </aside>
      <main className="p-6 md:p-10">{children}</main>
    </div>
  );
}
