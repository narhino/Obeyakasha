import { requireSubject } from "@/lib/auth-helpers";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { whispersForSubject } from "@/lib/feed/whispers";
import { WhispersFeed } from "@/components/whispers/WhispersFeed";
import { Display } from "@/components/ui";
import { copy } from "@/copy/copy";

export default async function WhispersPage() {
  const session = await requireSubject();
  const access = await resolveAccess(session.user.id);
  const items = await whispersForSubject(session.user.id, access.accessLevel);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display className="text-3xl">{copy.whispers.title}</Display>
      <WhispersFeed items={items} />
    </main>
  );
}
