import { requireSubject } from "@/lib/auth-helpers";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { listProgramsForSubject } from "@/lib/programs/queries";
import { ProgramsClient } from "@/components/programs/ProgramsClient";
import { Display } from "@/components/ui";

export default async function ProgramsPage() {
  const session = await requireSubject();
  const access = await resolveAccess(session.user.id);
  const programs = await listProgramsForSubject(
    session.user.id,
    access.accessLevel,
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display size="opener">Trainings</Display>
      <p className="mb-6 mt-1 text-sm text-text-dim">
        Built in order. Finish one to open the next.
      </p>
      <ProgramsClient programs={programs} />
    </main>
  );
}
