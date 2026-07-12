import { requireSubject } from "@/lib/auth-helpers";
import { MessageThread } from "@/components/messages/MessageThread";
import { Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

export default async function MessagesPage() {
  await requireSubject();
  return (
    <main className="mx-auto flex max-w-2xl flex-col px-4 py-8">
      <Display className="text-3xl">{copy.messages.title}</Display>
      <Whisper className="mt-1">She reads everything.</Whisper>
      <MessageThread />
    </main>
  );
}
