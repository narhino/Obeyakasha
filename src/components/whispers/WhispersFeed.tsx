"use client";

import { useState } from "react";
import Link from "next/link";
import type { WhisperAudioView, WhisperCard } from "@/lib/feed/whispers";
import type { CommentState } from "@/lib/feed/comments";
import { copy, fill } from "@/copy/copy";
import { formatWhen } from "@/lib/format/when";
import { formatDuration } from "@/lib/format/duration";
import { usePlayer, type QueueTrack } from "@/lib/player/store";
import { Eyebrow, Voice } from "@/components/ui";
import { IconDrop, IconLock, IconPlay, IconSpeak } from "@/components/ui/icons";
import { FeedPoll } from "./FeedPoll";

/**
 * The Whispers feed (Home). Subjects never post whispers — they kneel, love, and
 * speak privately beneath. Her words are set in the D3 voice (italic display),
 * and any image she attached blooms above the words as the card's art.
 * `signedIn` toggles subject affordances (kneel, love toggle, the private
 * composer) vs the logged-out public view (read + connect CTAs). Loves show as
 * an aggregate to EVERYONE; comments are visible only to their author (D7).
 */
export function WhispersFeed({
  items,
  signedIn,
  preview = false,
}: {
  items: WhisperCard[];
  signedIn: boolean;
  /** The Sanctum's read-through: the exact card, minus the affordances that
   *  would have her kneeling to her own words. */
  preview?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-8 font-[family-name:var(--font-display)] text-lg italic text-text-dim">
        {signedIn ? copy.whispers.empty : copy.whispers.publicEmpty}
      </p>
    );
  }
  return (
    <ul className="enter-stagger mt-8 space-y-4">
      {items.map((w) => (
        <WhisperItem
          key={w.id}
          whisper={w}
          signedIn={signedIn}
          preview={preview}
        />
      ))}
    </ul>
  );
}

/** Her mark at the head of every card — the one voice this feed carries. */
function GoddessMark({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/[0.07] font-[family-name:var(--font-display)] italic text-gold ${
        large ? "h-11 w-11 text-lg" : "h-9 w-9 text-base"
      }`}
    >
      A
    </span>
  );
}

function WhisperItem({
  whisper,
  signedIn,
  preview,
}: {
  whisper: WhisperCard;
  signedIn: boolean;
  preview: boolean;
}) {
  const [knelt, setKnelt] = useState(whisper.knelt);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const featured = whisper.pinned;

  async function doKneel() {
    if (knelt || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/whispers/${whisper.id}/kneel`, { method: "POST" });
      setKnelt(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      id={`whisper-${whisper.id}`}
      className={`scroll-mt-24 overflow-hidden rounded-[var(--radius-lg)] border ${
        featured
          ? "border-gold/30 bg-surface-raised elev-2"
          : "border-line/80 bg-surface"
      }`}
    >
      {/* Byline first, the way a feed reads: whose voice, how long ago, and
          whether she's holding this one up. */}
      <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
        <GoddessMark large={featured} />
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-display)] text-[0.95rem] text-text">
            {copy.whispers.byline}
          </p>
          <p
            className="text-xs text-text-dim/70"
            suppressHydrationWarning
          >
            {whisper.publishedAt ? formatWhen(whisper.publishedAt) : ""}
          </p>
        </div>
        {whisper.pinned ? (
          <Eyebrow className="shrink-0 text-gold/80">
            {copy.whispers.pinnedLabel}
          </Eyebrow>
        ) : null}
      </div>

      {whisper.imageUrl ? (
        <div
          className={`relative mt-3 w-full overflow-hidden ${
            featured ? "aspect-[16/9]" : "aspect-[5/2]"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={whisper.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
          {/* Scrim melts the image into the card body below. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, var(--color-surface), transparent 62%)",
            }}
          />
        </div>
      ) : null}

      <div
        className={
          featured ? "px-6 pb-6 pt-4 sm:px-7 sm:pb-7" : "px-4 pb-4 pt-3 sm:px-5 sm:pb-5"
        }
      >
        {whisper.body ? (
          featured ? (
            <p className="font-[family-name:var(--font-display)] text-2xl leading-[1.28] italic text-text sm:text-[1.75rem]">
              {whisper.body}
            </p>
          ) : (
            <Voice className="leading-relaxed">{whisper.body}</Voice>
          )
        ) : null}

        {whisper.audio ? (
          <FeedAudio audio={whisper.audio} signedIn={signedIn} />
        ) : null}

        {whisper.poll ? (
          <FeedPoll poll={whisper.poll} signedIn={signedIn} readOnly={preview} />
        ) : null}

        {/* One bar, three things she can be met with — every affordance
            visible rather than hidden behind a line of small text. */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line/50 pt-3">
          <div className="flex items-center gap-5">
            {preview ? (
              <span className="inline-flex items-center gap-2 text-text-dim/70">
                <IconDrop size={17} />
                <span className="nums-lining text-xs tracking-[0.04em]">
                  {whisper.loveCount}
                </span>
              </span>
            ) : (
              <LoveMark
                whisperId={whisper.id}
                initialLoved={whisper.loved}
                initialCount={whisper.loveCount}
                signedIn={signedIn}
              />
            )}
            {signedIn && !preview ? (
              <button
                onClick={() => setSpeaking((v) => !v)}
                aria-expanded={speaking}
                className="group inline-flex items-center gap-2 text-text-dim/70 transition-colors duration-[var(--dur-med)] hover:text-gold"
              >
                <IconSpeak size={16} />
                <span className="nums-lining text-xs tracking-[0.04em]">
                  {whisper.comments.length > 0
                    ? whisper.comments.length
                    : copy.whispers.comments.open}
                </span>
              </button>
            ) : null}
          </div>
          {signedIn && !preview ? (
            <button
              onClick={doKneel}
              disabled={knelt || busy}
              className={`rounded-[var(--radius-full)] border px-5 py-1.5 text-sm tracking-[0.06em] transition-colors duration-[var(--dur-med)] ${
                knelt
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-line text-text-dim hover:border-gold hover:text-gold"
              }`}
            >
              {knelt ? copy.whispers.knelt : copy.whispers.kneel}
            </button>
          ) : null}
          {preview ? (
            <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim/50">
              as they see it
            </span>
          ) : null}
        </div>

        {signedIn && !preview && (speaking || whisper.comments.length > 0) ? (
          <WhisperComments
            whisperId={whisper.id}
            initial={whisper.comments}
            open={speaking}
            setOpen={setSpeaking}
          />
        ) : null}
      </div>
    </li>
  );
}

/**
 * A track she pinned to the whisper — played straight from the card, no trip to
 * the Library. Sealed for anyone who may not hear it: the row still shows the
 * title (that's the pull) but the tap goes to the Gate / the Library instead of
 * a play that would 404. `playable` was already decided server-side against the
 * same rule the stream endpoint enforces.
 */
function FeedAudio({
  audio,
  signedIn,
}: {
  audio: WhisperAudioView;
  signedIn: boolean;
}) {
  const playNow = usePlayer((s) => s.playNow);
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const isThis = current?.id === audio.id;

  const track: QueueTrack = {
    id: audio.id,
    title: audio.title,
    durationS: audio.durationS,
    artworkKey: audio.cover,
  };

  const art = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={audio.cover}
      alt=""
      className="h-12 w-12 shrink-0 rounded-[var(--radius-sm)] object-cover"
    />
  );
  const meta = (
    <div className="min-w-0 flex-1 text-left">
      <p className="truncate text-sm text-text">{audio.title}</p>
      <p className="text-xs text-text-dim">
        {audio.playable
          ? audio.durationS
            ? formatDuration(audio.durationS)
            : copy.whispers.audio.listen
          : copy.whispers.audio.sealed}
      </p>
    </div>
  );

  if (!audio.playable) {
    return (
      <Link
        href={signedIn ? "/library" : "/signin"}
        className="mt-4 flex items-center gap-3 rounded-[var(--radius)] border border-line/70 bg-bg/40 p-2.5 transition-colors duration-[var(--dur-med)] hover:border-gold/50"
      >
        <div className="relative shrink-0">
          {art}
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-bg/65 text-text-dim"
          >
            <IconLock size={15} />
          </span>
        </div>
        {meta}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => playNow([track], 0)}
      aria-label={fill(copy.whispers.audio.playLabel, { title: audio.title })}
      className="mt-4 flex w-full items-center gap-3 rounded-[var(--radius)] border border-gold/25 bg-gold/[0.05] p-2.5 transition-colors duration-[var(--dur-med)] hover:border-gold/60"
    >
      <div className="relative shrink-0">
        {art}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-bg/45 text-gold"
        >
          <IconPlay size={16} className="translate-x-[1px]" />
        </span>
      </div>
      {meta}
      {isThis && playing ? (
        <span className="shrink-0 pr-1 text-[0.6875rem] uppercase tracking-[0.1em] text-gold">
          {copy.whispers.audio.nowPlaying}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The love mark — a candlelit gold bead + the aggregate count in her voice.
 * EVERYONE sees the number, never who (D7). Signed-in: taps toggle with an
 * optimistic update + a one-shot gold pulse (reduced-motion-gated by the CSS).
 * Logged-out: the mark links to the Gate (the existing connect invitation).
 */
function LoveMark({
  whisperId,
  initialLoved,
  initialCount,
  signedIn,
}: {
  whisperId: string;
  initialLoved: boolean;
  initialCount: number;
  signedIn: boolean;
}) {
  const [loved, setLoved] = useState(initialLoved);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState(false);

  const label =
    count > 0 ? fill(copy.whispers.loves.count, { n: count }) : copy.whispers.loves.none;

  if (!signedIn) {
    return (
      <Link
        href="/signin"
        aria-label={copy.whispers.loves.connect}
        title={copy.whispers.loves.connect}
        className="group inline-flex items-center gap-2 text-text-dim/70 transition-colors duration-[var(--dur-med)] hover:text-gold"
      >
        <IconDrop size={17} />
        <span className="nums-lining text-xs tracking-[0.04em]">{label}</span>
      </Link>
    );
  }

  async function toggle() {
    if (busy) return;
    const prevLoved = loved;
    const prevCount = count;
    const next = !prevLoved;
    setLoved(next);
    setCount(Math.max(0, prevCount + (next ? 1 : -1)));
    if (next) setPulse(true);
    setBusy(true);
    try {
      const res = await fetch(`/api/whispers/${whisperId}/love`, {
        method: "POST",
      });
      const data = (await res.json()) as { loved: boolean; count: number };
      setLoved(data.loved);
      setCount(data.count);
    } catch {
      setLoved(prevLoved);
      setCount(prevCount);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={loved}
      aria-label={loved ? copy.whispers.loves.taken : copy.whispers.loves.give}
      className={`group inline-flex items-center gap-2 transition-colors duration-[var(--dur-med)] ${
        loved ? "text-gold" : "text-text-dim/70 hover:text-gold"
      }`}
    >
      <span
        className={pulse ? "love-pulse inline-flex" : "inline-flex"}
        onAnimationEnd={() => setPulse(false)}
      >
        <IconDrop size={17} filled={loved} />
      </span>
      <span className="nums-lining text-xs tracking-[0.04em]">{label}</span>
    </button>
  );
}

interface ThreadComment {
  id: string;
  body: string;
  state: CommentState;
  reply: string | null;
}

/**
 * A subject's private thread beneath a whisper (D7). "Speak under this" opens a
 * quiet inline composer; their own words render below with the state of how she
 * has met each — and her reply, when she has spoken, in her voice. No other
 * subject's comment ever reaches here, and there is no count shown.
 */
function WhisperComments({
  whisperId,
  initial,
  open,
  setOpen,
}: {
  whisperId: string;
  initial: ThreadComment[];
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const [comments, setComments] = useState<ThreadComment[]>(
    initial.map((c) => ({
      id: c.id,
      body: c.body,
      state: c.state,
      reply: c.reply,
    })),
  );
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    if (!value.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/whispers/${whisperId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: value }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reason?: string;
        comment?: ThreadComment;
        error?: string;
      };
      if (data.ok === false && data.reason === "full") {
        setNotice(copy.whispers.comments.full);
      } else if (data.comment) {
        const added = data.comment;
        setComments((cs) => [
          { id: added.id, body: added.body, state: added.state, reply: added.reply },
          ...cs.filter((c) => c.id !== added.id),
        ]);
        setValue("");
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {comments.length > 0 ? (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="border-l-2 border-gold/25 pl-3">
              <p className="text-sm leading-relaxed text-text-dim">{c.body}</p>
              {c.state === "replied" && c.reply ? (
                <div className="mt-2">
                  <Voice className="text-[0.9375rem] leading-relaxed">
                    {c.reply}
                  </Voice>
                  <p className="mt-1 text-[0.6875rem] tracking-[0.04em] text-gold/70">
                    {copy.whispers.comments.state.replied}
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-[0.6875rem] tracking-[0.04em] text-text-dim/60">
                  {c.state === "seen"
                    ? copy.whispers.comments.state.seen
                    : copy.whispers.comments.state.unheard}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className={comments.length > 0 ? "mt-3" : ""}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
            maxLength={500}
            autoFocus
            placeholder={copy.whispers.comments.placeholder}
            className="w-full rounded-[var(--radius)] border border-line bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-text-dim/45 focus:border-gold/70 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={submit}
              disabled={busy || !value.trim()}
              className="rounded-[var(--radius-full)] border border-gold bg-gold/10 px-4 py-1 text-xs tracking-[0.06em] text-gold transition-colors duration-[var(--dur-med)] hover:bg-gold/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-text-dim/45"
            >
              {busy ? copy.whispers.comments.sending : copy.whispers.comments.send}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setValue("");
                setNotice(null);
              }}
              className="text-xs tracking-[0.04em] text-text-dim/70 transition-colors hover:text-text-dim"
            >
              {copy.whispers.comments.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p className="mt-2 text-xs text-gold">{notice}</p>
      ) : null}
    </div>
  );
}
