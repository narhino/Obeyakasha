"use client";

import { useActionState, useState } from "react";
import { Button, Input, Select, Whisper } from "@/components/ui";
import { publishWhisper, type WhisperFormState } from "./actions";

interface SubjectOption {
  id: string;
  name: string | null;
  email: string | null;
}
interface PollOption {
  id: string;
  question: string;
}

/**
 * The whisper composer (F03). The poll attach is gated client-side: choosing
 * "Attach an open poll" disables the submit until a poll is actually picked (and
 * "Create a quick poll" until a question is typed), so the old "attach a poll
 * with none selected → 500" can't happen. The server action mirrors the checks
 * and returns a friendly field error instead of throwing, as defence in depth.
 */
export function WhisperComposer({
  subjects,
  openPolls,
}: {
  subjects: SubjectOption[];
  openPolls: PollOption[];
}) {
  const [state, formAction, pending] = useActionState<WhisperFormState, FormData>(
    publishWhisper,
    {},
  );

  const [audienceType, setAudienceType] = useState("all");
  const [userId, setUserId] = useState("");
  const [pollMode, setPollMode] = useState("none");
  const [existingPollId, setExistingPollId] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");

  // Mirror of the server's guards, so the button only lights when it will land.
  const missingSubject = audienceType === "user" && !userId;
  const pollUnready =
    (pollMode === "existing" && !existingPollId) ||
    (pollMode === "new" && pollQuestion.trim().length === 0);
  const cannotSend = missingSubject || pollUnready;

  return (
    <form action={formAction} className="space-y-3">
      <textarea
        name="body"
        maxLength={500}
        rows={3}
        placeholder="Say it… (optional if you attach a poll)"
        className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
      />
      {/* Labelled like the Orders form, so the level/subject fields aren't
          cryptic bare inputs (F24). */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Audience
          <Select
            name="audienceType"
            value={audienceType}
            onChange={(e) => setAudienceType(e.target.value)}
          >
            <option value="public">Public (logged-out too)</option>
            <option value="all">Everyone signed in</option>
            <option value="level">Access level ≥</option>
            <option value="user">One subject</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Level
          <Input name="level" type="number" min={0} max={99} defaultValue={1} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          Subject
          <Select
            name="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.email ?? s.id.slice(0, 8)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Poll attach — none · an existing open poll · a fresh inline poll. */}
      <fieldset className="space-y-3 rounded-[var(--radius)] border border-line/70 p-3">
        <legend className="label-caps px-1 text-text-dim">Poll</legend>
        <Select
          name="pollMode"
          value={pollMode}
          onChange={(e) => setPollMode(e.target.value)}
        >
          <option value="none">No poll</option>
          <option value="existing">Attach an open poll</option>
          <option value="new">Create a quick poll</option>
        </Select>
        {pollMode === "existing" ? (
          <Select
            name="existingPollId"
            value={existingPollId}
            onChange={(e) => setExistingPollId(e.target.value)}
            className="w-full"
          >
            <option value="">— pick an open poll —</option>
            {openPolls.map((p) => (
              <option key={p.id} value={p.id}>
                {p.question}
              </option>
            ))}
          </Select>
        ) : null}
        {pollMode === "new" ? (
          <>
            <Input
              name="pollQuestion"
              maxLength={200}
              placeholder="Quick poll question"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              className="w-full"
            />
            <textarea
              name="pollOptions"
              rows={3}
              placeholder={
                "One option per line (2–6)\ne.g. A chastity file\nA doll transformation"
              }
              className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
            />
          </>
        ) : null}
      </fieldset>

      {state?.error ? (
        <Whisper className="text-danger">{state.error}</Whisper>
      ) : null}
      {state?.ok ? (
        <Whisper className="text-gold">{"It's out. They'll feel it."}</Whisper>
      ) : null}

      <Button type="submit" variant="gold" loading={pending} disabled={cannotSend}>
        Whisper
      </Button>
    </form>
  );
}
