import { requireSubject } from "@/lib/auth-helpers";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { openPollsForSubject } from "@/lib/polls/ops";
import { pendingQuestions } from "@/lib/questions/ops";
import { AsksClient } from "@/components/asks/AsksClient";
import { Display, Whisper } from "@/components/ui";

export default async function AsksPage() {
  const session = await requireSubject();
  const access = await resolveAccess(session.user.id);
  const [polls, questions] = await Promise.all([
    openPollsForSubject(session.user.id, access.accessLevel),
    pendingQuestions(session.user.id, access.accessLevel),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display size="opener">She&apos;s asking</Display>
      {polls.length === 0 && questions.length === 0 ? (
        <Whisper className="mt-6">Nothing right now. Wait for her.</Whisper>
      ) : (
        <AsksClient polls={polls} questions={questions} />
      )}
    </main>
  );
}
