"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";
import type { PollOption } from "@/lib/polls/tally";

interface PollView {
  id: string;
  question: string;
  options: PollOption[];
  myVote: string | null;
}

export function AsksClient({
  polls,
  questions,
}: {
  polls: PollView[];
  questions: { id: string; prompt: string }[];
}) {
  return (
    <div className="mt-6 space-y-4">
      {polls.map((p) => (
        <PollCard key={p.id} poll={p} />
      ))}
      {questions.map((q) => (
        <QuestionCard key={q.id} question={q} />
      ))}
    </div>
  );
}

function PollCard({ poll }: { poll: PollView }) {
  const [voted, setVoted] = useState<string | null>(poll.myVote);
  const router = useRouter();

  async function vote(optionId: string) {
    setVoted(optionId);
    await fetch(`/api/polls/${poll.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    router.refresh();
  }

  return (
    <Card raised>
      <p className="font-[family-name:var(--font-display)] text-lg">
        {poll.question}
      </p>
      <div className="mt-3 space-y-2">
        {poll.options.map((o) => (
          <button
            key={o.id}
            onClick={() => vote(o.id)}
            className={`w-full rounded-[var(--radius)] border px-3 py-2 text-left text-sm ${
              voted === o.id
                ? "border-gold bg-gold/15 text-gold"
                : "border-line text-text hover:border-text-dim"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {voted ? <Whisper className="mt-2 text-gold">{copy.poll.voted}</Whisper> : null}
    </Card>
  );
}

function QuestionCard({
  question,
}: {
  question: { id: string; prompt: string };
}) {
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function submit() {
    if (!answer.trim()) return;
    await fetch(`/api/questions/${question.id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <Card>
        <Whisper className="text-gold">I heard you.</Whisper>
      </Card>
    );
  }

  return (
    <Card raised>
      <p className="font-[family-name:var(--font-display)] text-lg">
        {question.prompt}
      </p>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        placeholder="Answer me."
        className="mt-3 w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
      />
      <Button variant="gold" size="sm" className="mt-2" onClick={submit}>
        Tell her
      </Button>
    </Card>
  );
}
