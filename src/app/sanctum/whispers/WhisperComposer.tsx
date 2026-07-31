"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Input, Select, Whisper } from "@/components/ui";
import { IconPlay, IconSpark, IconWarn } from "@/components/ui/icons";
import {
  NO_IMAGE,
  WhisperImageField,
  WhisperImageInputs,
  type WhisperImageValue,
} from "@/components/whispers/WhisperImageField";
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
interface TrackOption {
  id: string;
  title: string;
  minAccessLevel: number;
  freeSample: boolean;
}

/** Who the whisper is for, said plainly. The chip row replaced three bare
 *  selects — she picks a reach, and only the field that reach needs appears. */
const AUDIENCES = [
  { value: "public", label: "Everyone", hint: "Signed in or not — the public front door." },
  { value: "all", label: "All subjects", hint: "Everyone with an account." },
  { value: "level", label: "By level", hint: "Only subjects at or above a level." },
  { value: "oath", label: "The Collared", hint: "Your inner circle only." },
  { value: "user", label: "One subject", hint: "A whisper meant for one." },
] as const;

const MAX_BODY = 500;

/**
 * The whisper composer. Written to feel like posting anywhere else she posts —
 * one box, an attachment row (image · track · poll), and a plain-language
 * audience picker — with a live preview of the card underneath so she sees what
 * lands before it lands.
 *
 * Guards mirror the server action so the button only lights when the post will
 * actually go through (the old "attach a poll with none picked → 500" is gone
 * on both ends).
 */
export function WhisperComposer({
  subjects,
  openPolls,
  tracks,
}: {
  subjects: SubjectOption[];
  openPolls: PollOption[];
  tracks: TrackOption[];
}) {
  const [state, formAction, pending] = useActionState<WhisperFormState, FormData>(
    publishWhisper,
    {},
  );

  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState("all");
  const [level, setLevel] = useState("1");
  const [userId, setUserId] = useState("");
  const [pollMode, setPollMode] = useState("none");
  const [existingPollId, setExistingPollId] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [silent, setSilent] = useState(false);

  // Attachments
  const [image, setImage] = useState<WhisperImageValue>(NO_IMAGE);
  const [audioTrackId, setAudioTrackId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const attachedTrack = tracks.find((t) => t.id === audioTrackId) ?? null;
  const audience = AUDIENCES.find((a) => a.value === audienceType)!;

  // After a successful post, empty the box — otherwise her last whisper sits
  // there looking like it never sent, and she posts it twice.
  useEffect(() => {
    if (!state?.ok) return;
    setBody("");
    setImage(NO_IMAGE);
    setAudioTrackId("");
    setPollMode("none");
    setExistingPollId("");
    setPollQuestion("");
    setPollOptions("");
    setScheduledFor("");
    setShowSchedule(false);
    setSilent(false);
  }, [state]);

  const missingSubject = audienceType === "user" && !userId;
  const pollUnready =
    (pollMode === "existing" && !existingPollId) ||
    (pollMode === "new" && pollQuestion.trim().length === 0);
  const nothingToSay =
    body.trim().length === 0 && pollMode === "none" && !image.key && !audioTrackId;
  // A picture that's still lifting has a preview but no key yet — posting now
  // would drop it.
  const imagePending = Boolean(image.previewUrl) && !image.key;
  const cannotSend =
    missingSubject || pollUnready || nothingToSay || imagePending;

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {/* Hidden carriers for state the chips/attachments own. */}
      <input type="hidden" name="audienceType" value={audienceType} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="pollMode" value={pollMode} />
      <WhisperImageInputs value={image} />
      <input type="hidden" name="audioTrackId" value={audioTrackId} />
      {silent ? <input type="hidden" name="silent" value="true" /> : null}
      {!showSchedule ? <input type="hidden" name="scheduledFor" value="" /> : null}

      {/* The box. */}
      <div className="rounded-[var(--radius)] border border-line/70 bg-bg/50 transition-colors duration-[var(--dur-med)] focus-within:border-gold/60">
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY}
          rows={3}
          placeholder="Say it to them…"
          className="w-full resize-y bg-transparent px-4 py-3 font-[family-name:var(--font-display)] text-lg italic leading-relaxed text-text placeholder:not-italic placeholder:font-[family-name:var(--font-sans)] placeholder:text-base placeholder:text-text-dim/45 focus:outline-none"
        />
        {attachedTrack ? (
          <div className="mx-3 mb-3 flex items-center gap-3 rounded-[var(--radius)] border border-gold/25 bg-gold/[0.06] px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
              <IconPlay size={14} className="translate-x-[1px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text">{attachedTrack.title}</p>
              <p className="text-xs text-text-dim">
                {attachedTrack.freeSample
                  ? "Free sample — anyone who sees this can hear it."
                  : `Level ${attachedTrack.minAccessLevel}+ — sealed for the rest.`}
              </p>
              {/* The point of attaching one: the card carries them to the file's
                  own page, so "it's up" doesn't send them hunting. */}
              <p className="text-[0.6875rem] uppercase tracking-[0.12em] text-gold/70">
                They tap it → straight to the file in the Library
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAudioTrackId("")}
              className="shrink-0 text-xs text-text-dim transition-colors hover:text-danger"
            >
              Remove
            </button>
          </div>
        ) : null}

        {/* The picture + how it sits, previewed exactly as the card will show
            it. Lives above the attachment row because it's the biggest thing a
            whisper can carry. */}
        {image.previewUrl ? (
          <div className="mx-3 mb-3">
            <WhisperImageField value={image} onChange={setImage} />
          </div>
        ) : null}

        {/* Attachment row — the things a whisper can carry. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line/50 px-3 py-2">
          {image.previewUrl ? null : (
            <WhisperImageField value={image} onChange={setImage} />
          )}
          <label className="inline-flex items-center">
            <span className="sr-only">Attach a track</span>
            <Select
              value={audioTrackId}
              onChange={(e) => setAudioTrackId(e.target.value)}
              className="max-w-[13rem] text-xs"
            >
              <option value="">Attach a track…</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </label>
          <button
            type="button"
            onClick={() => setPollMode(pollMode === "none" ? "new" : "none")}
            className={`rounded-[var(--radius-full)] border px-3 py-1 text-xs tracking-[0.04em] transition-colors duration-[var(--dur-med)] ${
              pollMode !== "none"
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-line text-text-dim hover:border-gold hover:text-gold"
            }`}
          >
            Poll
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSchedule((v) => !v);
              if (showSchedule) setScheduledFor("");
            }}
            className={`rounded-[var(--radius-full)] border px-3 py-1 text-xs tracking-[0.04em] transition-colors duration-[var(--dur-med)] ${
              showSchedule
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-line text-text-dim hover:border-gold hover:text-gold"
            }`}
          >
            Later
          </button>
          <span className="ml-auto text-xs tabular-nums text-text-dim/60">
            {body.length}/{MAX_BODY}
          </span>
        </div>
      </div>

      {/* Poll, only when she asked for one. */}
      {pollMode !== "none" ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-line/70 p-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPollMode("new")}
              className={`rounded-[var(--radius-full)] border px-3 py-1 text-xs transition-colors ${
                pollMode === "new"
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-line text-text-dim hover:text-gold"
              }`}
            >
              New poll
            </button>
            <button
              type="button"
              onClick={() => setPollMode("existing")}
              disabled={openPolls.length === 0}
              className={`rounded-[var(--radius-full)] border px-3 py-1 text-xs transition-colors disabled:opacity-40 ${
                pollMode === "existing"
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-line text-text-dim hover:text-gold"
              }`}
            >
              An open one ({openPolls.length})
            </button>
          </div>
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
          ) : (
            <>
              <Input
                name="pollQuestion"
                maxLength={200}
                placeholder="What are you asking them?"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                className="w-full"
              />
              <textarea
                name="pollOptions"
                rows={3}
                value={pollOptions}
                onChange={(e) => setPollOptions(e.target.value)}
                placeholder={
                  "One option per line (2–6)\ne.g. A chastity file\nA doll transformation"
                }
                className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
              />
            </>
          )}
        </div>
      ) : null}

      {showSchedule ? (
        <label className="flex flex-col gap-1 text-xs text-text-dim">
          When it drops
          <Input
            name="scheduledFor"
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="w-60"
          />
          <span className="text-text-dim/70">
            Invisible to them until then — then it posts and pushes itself.
          </span>
        </label>
      ) : null}

      {/* Audience — chips, then only the field that reach needs. */}
      <div>
        <div className="flex flex-wrap gap-2">
          {AUDIENCES.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setAudienceType(a.value)}
              className={`rounded-[var(--radius-full)] border px-3.5 py-1.5 text-xs tracking-[0.04em] transition-colors duration-[var(--dur-med)] ${
                audienceType === a.value
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-line text-text-dim hover:border-gold/60 hover:text-text"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-text-dim/75">{audience.hint}</p>

        {audienceType === "level" ? (
          <label className="mt-2 flex items-center gap-2 text-xs text-text-dim">
            Level at least
            <Input
              type="number"
              min={0}
              max={99}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-20"
            />
          </label>
        ) : null}
        {audienceType === "user" ? (
          <Select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-2 w-full max-w-sm"
          >
            <option value="">— which subject? —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.email ?? s.id.slice(0, 8)}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {state?.error ? (
        <Whisper className="flex items-center gap-1.5 text-danger">
          <IconWarn size={14} /> {state.error}
        </Whisper>
      ) : null}
      {state?.ok ? (
        <Whisper className="flex items-center gap-1.5 text-gold">
          <IconSpark size={14} />
          {state.scheduled
            ? "Set. It drops when you said — silent until then."
            : "It's out. They'll feel it."}
        </Whisper>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="gold" loading={pending} disabled={cannotSend}>
          {showSchedule && scheduledFor ? "Schedule it" : "Whisper"}
        </Button>
        {/* Silence only makes sense for a whisper going out now. */}
        {!showSchedule ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-dim">
            <input
              type="checkbox"
              checked={silent}
              onChange={(e) => setSilent(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-gold)]"
            />
            Post without waking them
          </label>
        ) : null}
      </div>
    </form>
  );
}
