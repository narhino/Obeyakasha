import { requireSubject } from "@/lib/auth-helpers";
import { InboxList } from "@/components/inbox/InboxList";
import { Display } from "@/components/ui";

export default async function InboxPage() {
  await requireSubject();
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display className="text-3xl">Whispers</Display>
      <InboxList />
    </main>
  );
}
