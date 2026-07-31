"use client";

import { useActionState, useState } from "react";
import { Button, Input, Label, Select, Whisper } from "@/components/ui";
import { IconSpark, IconWarn } from "@/components/ui/icons";
import { WhispersFeed } from "@/components/whispers/WhispersFeed";
import {
  WhisperImageField,
  WhisperImageInputs,
  type WhisperImageValue,
} from "@/components/whispers/WhisperImageField";
import type { WhisperCard } from "@/lib/feed/whispers";
import type { WhisperImageFit } from "@/lib/db/schema/relationship";
import { editWhisper, type WhisperFormState } from "../actions";

/** Who a whisper is for, in plain words — the same five reaches as the composer. */
const AUDIENCES = [
  { value: "public", label: "Everyone", hint: "Signed in or not — the public front door." },
  { value: "all", label: "All subjects", hint: "Everyone with an account." },
  { value: "level", label: "By level", hint: "Only subjects at or above a level." },
  { value: "oath", label: "The Collared", hint: "Your inner circle only." },
  { value: "user", label: "One subject", hint: "A whisper meant for one." },
] as const;

const MAX_BODY = 500;

export interface EditableWhisper {
  id: string;
  body: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  imageW: number | null;
  imageH: number | null;
  imageFit: WhisperImageFit;
  audienceType: string;
  audienceLevel: number;
  audienceUserId: string;
  audioTrackId: string | null;
  pinned: boolean;
  publishedAt: Date | null;
  loveCount: number;
  hasPoll: boolean;
}

export interface EditorTrack {
  id: string;
  title: string;
  slug: string;
  durationS: number | null;
  cover: string;
  minAccessLevel: number;
  freeSample: boolean;
}

/**
 * Change a whisper that is already out there — and watch the change land in the
 * card beneath, rendered by the very component her subjects read.
 *
 * The reach ("who sees this") is editable on purpose. A whisper sent to the
 * wrong audience used to have exactly one fix — delete it and speak again —
 * which threw away every love and everything said beneath it. Now she narrows
 * or opens it in place and nothing given under it is lost.
 *
 * Editing sends no push. It isn't a new whisper.
 */
export function WhisperEditor({
  whisper,
  subjects,
  tracks,
}: {
  whisper: EditableWhisper;
  subjects: { id: string; name: string | null; email: string | null }[];
  tracks: EditorTrack[];
}) {
  const [state, formAction, pending] = useActionState<WhisperFormState, FormData>(
    editWhisper,
    {},
  );

  const [body, setBody] = useState(whisper.body ?? "");
  const [audienceType, setAudienceType] = useState(whisper.audienceType);
  const [level, setLevel] = useState(String(whisper.audienceLevel));
  const [userId, setUserId] = useState(whisper.audienceUserId);
  const [audioTrackId, setAudioTrackId] = useState(whisper.audioTrackId ?? "");
  const [image, setImage] = useState<WhisperImageValue>({
    key: whisper.imageKey ?? "",
    w: whisper.imageW,
    h: whisper.imageH,
    fit: whisper.imageFit,
    previewUrl: whisper.imageUrl,
  });

  const audience = AUDIENCES.find((a) => a.value === audienceType)!;
  const track = tracks.find((t) => t.id === audioTrackId) ?? null;
  const imagePending = Boolean(image.previewUrl) && !image.key;
  const emptied =
    body.trim().length === 0 && !image.key && !audioTrackId && !whisper.hasPoll;

  // The card as they read it, rebuilt from what she has in front of her right
  // now. Level 999 / collared, so the preview never hides her own attachment
  // behind an entitlement she isn't subject to.
  const preview: WhisperCard = {
    id: whisper.id,
    body: body.trim() || null,
    imageKey: image.key || null,
    imageUrl: image.previewUrl,
    imageW: image.w,
    imageH: image.h,
    imageFit: image.fit,
    pinned: whisper.pinned,
    publishedAt: whisper.publishedAt,
    knelt: false,
    poll: null,
    loveCount: whisper.loveCount,
    loved: false,
    comments: [],
    audio: track
      ? {
          id: track.id,
          title: track.title,
          slug: track.slug,
          durationS: track.durationS,
          cover: track.cover,
          playable: true,
        }
      : null,
  };

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="whisperId" value={whisper.id} />
        <input type="hidden" name="audienceType" value={audienceType} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="level" value={level} />
        <input type="hidden" name="audioTrackId" value={audioTrackId} />
        <WhisperImageInputs value={image} />

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
          <div className="border-t border-line/50 px-3 py-2">
            <WhisperImageField value={image} onChange={setImage} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center">
                <span className="sr-only">The file this points at</span>
                <Select
                  value={audioTrackId}
                  onChange={(e) => setAudioTrackId(e.target.value)}
                  className="max-w-[15rem] text-xs"
                >
                  <option value="">No file attached</option>
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
              </label>
              <span className="ml-auto text-xs tabular-nums text-text-dim/60">
                {body.length}/{MAX_BODY}
              </span>
            </div>
            {track ? (
              <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.12em] text-gold/70">
                They tap it → straight to the file in the Library
              </p>
            ) : null}
          </div>
        </div>

        {/* Privacy — the reach can be changed after the fact. */}
        <div>
          <Label className="block">Who sees this</Label>
          <div className="mt-2 flex flex-wrap gap-2">
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
          <Whisper className="mt-2 text-xs">
            Narrowing the reach hides it from anyone outside it — what they
            already gave under it stays. No one is notified again.
          </Whisper>
        </div>

        {state?.error ? (
          <Whisper className="flex items-center gap-1.5 text-danger">
            <IconWarn size={14} /> {state.error}
          </Whisper>
        ) : null}
        {state?.ok ? (
          <Whisper className="flex items-center gap-1.5 text-gold">
            <IconSpark size={14} /> Changed. That&apos;s what they see now.
          </Whisper>
        ) : null}

        <Button
          type="submit"
          variant="gold"
          loading={pending}
          disabled={imagePending || emptied || (audienceType === "user" && !userId)}
        >
          Save the change
        </Button>
      </form>

      {/* Exactly what lands, in the component they actually read. */}
      <div>
        <Label className="block">As they see it</Label>
        <WhispersFeed items={[preview]} signedIn preview />
        {whisper.hasPoll ? (
          <Whisper className="mt-2 text-xs">
            The poll it carries isn&apos;t shown here — votes are already cast
            against it, so editing leaves it alone.
          </Whisper>
        ) : null}
      </div>
    </div>
  );
}
