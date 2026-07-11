import Link from "next/link";
import { requireSubject } from "@/lib/auth-helpers";
import { PlayerRoot } from "@/components/player/PlayerRoot";
import { copy } from "@/copy/copy";

const nav = [
  { href: "/library", label: copy.library.title },
  { href: "/programs", label: "Trainings" },
];

export default async function SubjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSubject();

  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link
            href="/library"
            className="font-[family-name:var(--font-display)] text-xl text-gold"
          >
            {copy.brand.name}
          </Link>
          <nav className="flex gap-4 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-text-dim hover:text-text"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
      <PlayerRoot />
    </div>
  );
}
