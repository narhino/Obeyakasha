import { requireSubject } from "@/lib/auth-helpers";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { Badge, Card, Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

export default async function Library() {
  const session = await requireSubject();
  const access = await resolveAccess(session.user.id);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Display className="text-3xl">{copy.library.title}</Display>
      <div className="mt-2 flex items-center gap-2">
        <Whisper>Your access</Whisper>
        {access.frozen ? (
          <Badge tone="danger">frozen</Badge>
        ) : access.inGrace ? (
          <Badge tone="gold">grace · level {access.accessLevel}</Badge>
        ) : (
          <Badge tone="gold">level {access.accessLevel}</Badge>
        )}
      </div>

      <Card className="mt-8">
        <Whisper>{copy.library.empty}</Whisper>
        <Whisper className="mt-2 text-xs">
          The Library, player, and programs arrive in milestone M1 (docs/PLAN.md
          §23). Your Patreon tier already resolves to the access level shown
          above.
        </Whisper>
      </Card>
    </main>
  );
}
