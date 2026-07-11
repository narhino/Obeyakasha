import { requireSubject } from "@/lib/auth-helpers";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { continueListening, listLibraryTracks } from "@/lib/library/queries";
import { LibraryClient } from "@/components/library/LibraryClient";
import { Badge, Display } from "@/components/ui";
import { copy } from "@/copy/copy";

export default async function LibraryPage() {
  const session = await requireSubject();
  const access = await resolveAccess(session.user.id);
  const [tracks, continueRow] = await Promise.all([
    listLibraryTracks(access.accessLevel),
    continueListening(session.user.id, access.accessLevel),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Display className="text-3xl">{copy.library.title}</Display>
        {access.frozen ? (
          <Badge tone="danger">frozen</Badge>
        ) : access.inGrace ? (
          <Badge tone="gold">grace · {access.accessLevel}</Badge>
        ) : (
          <Badge tone="gold">level {access.accessLevel}</Badge>
        )}
      </div>
      <LibraryClient tracks={tracks} continueRow={continueRow} />
    </main>
  );
}
