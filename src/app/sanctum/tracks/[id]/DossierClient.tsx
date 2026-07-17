"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Display,
  Input,
  Label,
  Select,
  Spinner,
  Whisper,
} from "@/components/ui";
import { IconPause, IconPlay } from "@/components/ui/icons";
import { formatClock } from "@/lib/format/duration";
import { usePolling } from "@/lib/hooks/usePolling";
import type {
  AnalysisKeyword,
  AnalysisTrigger,
  KeywordCategory,
} from "@/lib/analyze/schema";
import { VOCABULARY } from "@/lib/tags/vocabulary";

const ALL_VOCAB = Array.from(
  new Set(Object.values(VOCABULARY).flat()),
).sort();
import {
  addToPlaylistAction,
  addToProgramAction,
  addTagAction,
  approveKeywordAction,
  approveTriggerAction,
  dismissKeywordAction,
  dismissTriggerAction,
  removeFromPlaylistAction,
  removeFromProgramAction,
  removeTagAction,
  runAnalysisAction,
  saveDescriptionAction,
} from "./actions";

interface TrackLite {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  durationS: number | null;
  minAccessLevel: number;
  visibility: "draft" | "published" | "archived";
  pipeline: string;
  source: string;
  patreonPostId: string | null;
  hasAudio: boolean;
}
interface DossierData {
  model: string | null;
  summary: string | null;
  keywords: AnalysisKeyword[];
  triggers: AnalysisTrigger[];
  suggestedDescription: string | null;
  intendedEffects: string[];
  safetyNotes: string | null;
}
interface Placement {
  id: string;
  title: string;
  contains: boolean;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const CATEGORY_LABEL: Record<KeywordCategory, string> = {
  fetish: "Themes & fetishes",
  descriptive: "Descriptive",
  hypnosis_type: "Hypnosis type",
  state: "Intensity & state",
};
const CATEGORY_ORDER: KeywordCategory[] = [
  "fetish",
  "hypnosis_type",
  "state",
  "descriptive",
];

/** Polls the analysis-status endpoint while a run is in flight. Mounted only
 *  when running, so it stops the moment the dossier settles. */
function AnalysisPoller({ onTick }: { onTick: () => void }) {
  usePolling(onTick, 2500);
  return null;
}

export function DossierClient({
  track,
  streamUrl,
  transcript,
  dossier,
  appliedTags,
  appliedTriggerNames,
  analysisUpdatedAt,
  analyzeJobActive,
  programs,
  playlists,
}: {
  track: TrackLite;
  streamUrl: string | null;
  transcript: {
    status: string;
    fullText: string | null;
    segments: { start: number; end: number; text: string }[];
  } | null;
  dossier: DossierData | null;
  appliedTags: { tagId: string; kind: string; value: string }[];
  appliedTriggerNames: string[];
  analysisUpdatedAt: string | null;
  analyzeJobActive: boolean;
  programs: Placement[];
  playlists: Placement[];
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Compact in-house verify player state (F17) — no native <audio controls>.
  const [verifyPlaying, setVerifyPlaying] = useState(false);
  const [verifyPos, setVerifyPos] = useState(0);
  const [verifyDur, setVerifyDur] = useState(0);
  const [query, setQuery] = useState("");
  const router = useRouter();

  // ── Live "Run analysis" state (F02): never let the run feel dead ──
  const [running, setRunning] = useState(analyzeJobActive);
  const [runError, setRunError] = useState<string | null>(null);
  const baseUpdatedAt = useRef<string | null>(analysisUpdatedAt);
  const [, startAnalyze] = useTransition();

  const startRun = () => {
    setRunError(null);
    setRunning(true);
    const fd = new FormData();
    fd.set("trackId", track.id);
    startAnalyze(() => {
      void runAnalysisAction(fd);
    });
  };

  const pollAnalysis = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/sanctum/tracks/${track.id}/analysis-status`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        analysisUpdatedAt: string | null;
        job: { status: string; error: string | null } | null;
      };
      if (data.job?.status === "failed") {
        setRunError(data.job.error || "The reading broke off. Try again.");
        setRunning(false);
        return;
      }
      const settled = !data.job || data.job.status === "done";
      const changed =
        data.analysisUpdatedAt != null &&
        data.analysisUpdatedAt !== baseUpdatedAt.current;
      if (settled && changed) {
        baseUpdatedAt.current = data.analysisUpdatedAt;
        setRunning(false);
        router.refresh(); // pull the freshly-read keywords/triggers in
      }
    } catch {
      /* transient; the next tick retries */
    }
  }, [track.id, router]);

  const seek = (start: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, start);
    void a.play().catch(() => {});
  };

  const appliedTagSet = new Set(
    appliedTags.map((t) => `${t.kind}:${t.value.toLowerCase()}`),
  );
  const appliedTrigSet = new Set(appliedTriggerNames);

  const keywordsByCat = (cat: KeywordCategory) =>
    (dossier?.keywords ?? []).filter((k) => k.category === cat);

  const filteredSegments = (transcript?.segments ?? []).filter((s) =>
    query ? s.text.toLowerCase().includes(query.toLowerCase()) : true,
  );

  return (
    <div className="max-w-3xl pb-28">
      <Link
        href="/sanctum/library"
        className="text-xs uppercase tracking-[0.14em] text-text-dim hover:text-text"
      >
        ← Library
      </Link>

      {/* Header */}
      <div className="mt-3 flex items-start justify-between gap-3">
        <Display className="text-3xl">{track.title}</Display>
        <div className="flex flex-col items-end gap-1.5">
          <Badge
            tone={
              track.visibility === "published"
                ? "gold"
                : track.visibility === "archived"
                  ? "danger"
                  : "sealed"
            }
          >
            {track.visibility}
          </Badge>
          {track.source === "patreon_import" ? (
            <Badge tone="neutral">from Patreon</Badge>
          ) : null}
        </div>
      </div>
      <Whisper className="mt-1 text-xs">
        {track.durationS != null ? `${fmt(track.durationS)} · ` : ""}level{" "}
        {track.minAccessLevel} · pipeline: {track.pipeline}
        {dossier?.model === "assisted" ? " · deep analysis" : ""}
      </Whisper>

      {/* Live analysis state (F02): a working state + surfaced failure so
          "Run analysis" never looks dead. Polls only while a run is in flight. */}
      {running ? <AnalysisPoller onTick={pollAnalysis} /> : null}
      {running ? (
        <Card className="mt-4 border-gold/30" raised>
          <p className="flex items-center gap-2 text-sm text-gold">
            <Spinner /> She is reading it…
          </p>
          <Whisper className="mt-1 text-xs">
            Keywords and triggers appear here the moment she&apos;s done. You can
            keep working — this updates on its own.
          </Whisper>
        </Card>
      ) : runError ? (
        <Card className="mt-4 border-danger/30" raised>
          <p className="text-sm text-danger">{runError}</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={startRun}
          >
            Try again
          </Button>
        </Card>
      ) : null}

      {/* Description */}
      <Card className="mt-6">
        <Label>Description</Label>
        <form action={saveDescriptionAction} className="mt-2">
          <input type="hidden" name="trackId" value={track.id} />
          <textarea
            name="description"
            defaultValue={track.description ?? ""}
            rows={3}
            className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text focus:border-gold/70 focus:outline-none"
            placeholder="In her voice…"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button type="submit" size="sm">
              Save
            </Button>
            {dossier?.suggestedDescription ? (
              <span className="text-xs text-text-dim">
                A rewrite is suggested below — paste it in if you like it.
              </span>
            ) : null}
          </div>
        </form>
        {dossier?.suggestedDescription ? (
          <div className="mt-3 rounded-[var(--radius)] border border-line/70 bg-bg/40 p-3">
            <Label>Suggested rewrite</Label>
            <p className="mt-1 text-sm text-text-dim">
              {dossier.suggestedDescription}
            </p>
          </div>
        ) : null}
      </Card>

      {/* Reading: summary / intended effects / safety (populated by the Opus pass) */}
      {dossier &&
      (dossier.summary ||
        dossier.intendedEffects.length > 0 ||
        dossier.safetyNotes) ? (
        <Card className="mt-6">
          {dossier.summary ? (
            <p className="text-sm text-text-dim">{dossier.summary}</p>
          ) : null}
          {dossier.intendedEffects.length > 0 ? (
            <div className="mt-3">
              <Label>Intended effects</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {dossier.intendedEffects.map((e, i) => (
                  <Badge key={i} tone="neutral">
                    {e}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {dossier.safetyNotes ? (
            <div className="mt-3">
              <Label>Safety notes</Label>
              <p className="mt-1 text-sm text-text-dim">{dossier.safetyNotes}</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* No dossier yet */}
      {!dossier ? (
        <Card className="mt-6">
          <Whisper>
            This track hasn&apos;t been analysed yet. Run it to extract keywords
            and triggers.
          </Whisper>
          <div className="mt-3">
            <Button
              type="button"
              size="sm"
              variant="gold"
              loading={running}
              disabled={running}
              onClick={startRun}
            >
              {running ? "Reading…" : "Run analysis"}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Keywords → tags */}
      {dossier ? (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <Label>Keywords → tags</Label>
            <button
              type="button"
              onClick={startRun}
              disabled={running}
              className="text-xs text-text-dim transition-colors hover:text-text disabled:opacity-40"
            >
              {running ? "reading…" : "Re-analyse"}
            </button>
          </div>
          <Whisper className="mt-1 text-xs">
            Approve the ones that fit — they become tags subjects can filter by.
            Dismissed ones are kept, never lost.
          </Whisper>

          {CATEGORY_ORDER.filter((c) => keywordsByCat(c).length > 0).map(
            (cat) => (
              <div key={cat} className="mt-4">
                <p className="text-[0.7rem] uppercase tracking-[0.14em] text-text-dim/70">
                  {CATEGORY_LABEL[cat]}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {keywordsByCat(cat).map((k) => {
                    const applied = appliedTagSet.has(
                      `${k.tagKind}:${k.phrase.toLowerCase()}`,
                    );
                    const dismissed = k.status === "dismissed";
                    return (
                      <div
                        key={`${k.tagKind}:${k.phrase}`}
                        className={`flex items-center gap-1.5 rounded-[var(--radius)] border px-2 py-1 text-xs ${
                          applied
                            ? "border-gold/40 bg-gold/10 text-gold"
                            : dismissed
                              ? "border-line/60 bg-bg/30 text-text-dim/50 line-through"
                              : "border-line bg-surface-raised text-text-dim"
                        }`}
                      >
                        {k.evidence[0] ? (
                          <button
                            type="button"
                            onClick={() => seek(k.evidence[0]!.start)}
                            title="Play from here"
                            className="text-text-dim hover:text-gold"
                          >
                            <IconPlay size={12} />
                          </button>
                        ) : null}
                        <span>{k.phrase}</span>
                        {applied ? (
                          <AppliedTagRemove
                            trackId={track.id}
                            tag={appliedTags.find(
                              (t) =>
                                t.kind === k.tagKind &&
                                t.value.toLowerCase() === k.phrase.toLowerCase(),
                            )}
                          />
                        ) : (
                          <span className="flex items-center gap-1">
                            <form action={approveKeywordAction}>
                              <input type="hidden" name="trackId" value={track.id} />
                              <input type="hidden" name="phrase" value={k.phrase} />
                              <input type="hidden" name="tagKind" value={k.tagKind} />
                              <button
                                type="submit"
                                className="text-gold hover:underline"
                              >
                                approve
                              </button>
                            </form>
                            {!dismissed ? (
                              <form action={dismissKeywordAction}>
                                <input type="hidden" name="trackId" value={track.id} />
                                <input type="hidden" name="phrase" value={k.phrase} />
                                <input type="hidden" name="tagKind" value={k.tagKind} />
                                <button
                                  type="submit"
                                  className="text-text-dim/60 hover:text-danger"
                                >
                                  ✕
                                </button>
                              </form>
                            ) : null}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ),
          )}

          {/* Manual tag add */}
          <form
            action={addTagAction}
            className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3"
          >
            <input type="hidden" name="trackId" value={track.id} />
            <label className="flex flex-col gap-1 text-xs text-text-dim">
              Add a tag
              <Input
                name="value"
                placeholder="value"
                className="w-40"
                list="tag-vocab"
              />
              <datalist id="tag-vocab">
                {ALL_VOCAB.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
            <Select name="kind" defaultValue="theme" className="text-sm">
              <option value="theme">theme</option>
              <option value="purpose">purpose</option>
              <option value="format">format</option>
              <option value="intensity">intensity</option>
              <option value="custom">custom</option>
            </Select>
            <Button type="submit" size="sm" variant="ghost">
              Add
            </Button>
          </form>
        </Card>
      ) : null}

      {/* Triggers */}
      {dossier && dossier.triggers.length > 0 ? (
        <Card className="mt-6">
          <Label>Triggers</Label>
          <Whisper className="mt-1 text-xs">
            Tap the evidence to hear the exact moment before you approve. These
            never auto-apply — they&apos;re yours to confirm.
          </Whisper>
          <div className="mt-3 space-y-3">
            {dossier.triggers.map((t) => {
              const applied = appliedTrigSet.has(t.name.toLowerCase());
              const dismissed = t.status === "dismissed";
              return (
                <div
                  key={t.name}
                  className="rounded-[var(--radius)] border border-line/70 bg-bg/30 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-[family-name:var(--font-display)] text-base text-text">
                        {t.name}
                      </span>
                      <Badge tone="neutral">{t.relation}</Badge>
                      {applied ? <Badge tone="gold">on the track</Badge> : null}
                    </div>
                    {!applied ? (
                      <div className="flex items-center gap-2">
                        <form action={approveTriggerAction}>
                          <input type="hidden" name="trackId" value={track.id} />
                          <input type="hidden" name="name" value={t.name} />
                          <Button type="submit" size="sm" variant="gold">
                            Approve
                          </Button>
                        </form>
                        {!dismissed ? (
                          <form action={dismissTriggerAction}>
                            <input type="hidden" name="trackId" value={track.id} />
                            <input type="hidden" name="name" value={t.name} />
                            <Button type="submit" size="sm" variant="ghost">
                              Dismiss
                            </Button>
                          </form>
                        ) : (
                          <Badge tone="sealed">dismissed</Badge>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {t.evidence.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.evidence.map((e, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => seek(e.start)}
                          className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-line bg-surface-raised px-2 py-0.5 text-xs text-text-dim hover:border-gold/40 hover:text-gold"
                        >
                          <IconPlay size={12} />
                          {fmt(e.start)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* Placement */}
      <Card className="mt-6">
        <Label>Add to a training or series</Label>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <PlacementColumn
            title="Trainings"
            items={programs}
            trackId={track.id}
            addAction={addToProgramAction}
            removeAction={removeFromProgramAction}
            field="programId"
          />
          <PlacementColumn
            title="Series"
            items={playlists}
            trackId={track.id}
            addAction={addToPlaylistAction}
            removeAction={removeFromPlaylistAction}
            field="playlistId"
          />
        </div>
      </Card>

      {/* Transcript (admin-only) */}
      {transcript?.fullText ? (
        <Card className="mt-6">
          <div className="flex items-center justify-between gap-2">
            <Label>Transcript</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search…"
              className="w-40"
            />
          </div>
          <Whisper className="mt-1 text-[0.7rem] uppercase tracking-[0.14em] text-text-dim/60">
            Private — never shown to subjects
          </Whisper>
          {transcript.segments.length > 0 ? (
            <div className="mt-3 max-h-96 space-y-1 overflow-y-auto pr-1">
              {filteredSegments.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => seek(s.start)}
                  className="flex w-full gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface-raised"
                >
                  <span className="shrink-0 font-[family-name:var(--font-display)] text-xs text-gold/70">
                    {fmt(s.start)}
                  </span>
                  <span className="text-text-dim">{s.text}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 whitespace-pre-wrap text-sm text-text-dim">
              {transcript.fullText}
            </p>
          )}
        </Card>
      ) : null}

      {/* Sticky verification player — in-house token controls, not the raw
          native widget (F17). Keeps the same audioRef the transcript seeks. */}
      {streamUrl ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-text-dim">
              Verify
            </span>
            <audio
              ref={audioRef}
              src={streamUrl}
              preload="metadata"
              className="hidden"
              onPlay={() => setVerifyPlaying(true)}
              onPause={() => setVerifyPlaying(false)}
              onEnded={() => setVerifyPlaying(false)}
              onTimeUpdate={(e) => setVerifyPos(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) =>
                setVerifyDur(
                  Number.isFinite(e.currentTarget.duration)
                    ? e.currentTarget.duration
                    : 0,
                )
              }
            />
            <button
              type="button"
              onClick={() => {
                const a = audioRef.current;
                if (!a) return;
                if (a.paused) void a.play().catch(() => {});
                else a.pause();
              }}
              aria-label={verifyPlaying ? "Pause" : "Play"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep active:scale-95"
            >
              {verifyPlaying ? (
                <IconPause size={15} />
              ) : (
                <IconPlay size={15} className="translate-x-[1px]" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                const a = audioRef.current;
                if (!a || !verifyDur) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const frac = Math.min(
                  Math.max((e.clientX - rect.left) / rect.width, 0),
                  1,
                );
                a.currentTime = frac * verifyDur;
              }}
              aria-label="Move through it"
              className="group relative h-3 flex-1"
            >
              <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line" />
              <span
                className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gold transition-[width] duration-200 group-hover:h-[4px]"
                style={{
                  width: verifyDur
                    ? `${Math.min((verifyPos / verifyDur) * 100, 100)}%`
                    : "0%",
                }}
              />
            </button>
            <span className="shrink-0 tabular-nums text-xs text-text-dim">
              {formatClock(verifyPos)} / {formatClock(verifyDur)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AppliedTagRemove({
  trackId,
  tag,
}: {
  trackId: string;
  tag: { tagId: string } | undefined;
}) {
  if (!tag) return <span className="text-[0.65rem]">on track</span>;
  return (
    <form action={removeTagAction}>
      <input type="hidden" name="trackId" value={trackId} />
      <input type="hidden" name="tagId" value={tag.tagId} />
      <button
        type="submit"
        title="Remove tag"
        className="text-gold/60 hover:text-danger"
      >
        ✕
      </button>
    </form>
  );
}

function PlacementColumn({
  title,
  items,
  trackId,
  addAction,
  removeAction,
  field,
}: {
  title: string;
  items: Placement[];
  trackId: string;
  addAction: (fd: FormData) => Promise<void>;
  removeAction: (fd: FormData) => Promise<void>;
  field: string;
}) {
  const inIt = items.filter((i) => i.contains);
  const available = items.filter((i) => !i.contains);
  return (
    <div>
      <p className="text-[0.7rem] uppercase tracking-[0.14em] text-text-dim/70">
        {title}
      </p>
      <div className="mt-2 space-y-1">
        {inIt.length === 0 ? (
          <Whisper className="text-xs">Not in any {title.toLowerCase()}.</Whisper>
        ) : (
          inIt.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-gold/30 bg-gold/5 px-2 py-1 text-xs text-text"
            >
              <span className="truncate">{i.title}</span>
              <form action={removeAction}>
                <input type="hidden" name="trackId" value={trackId} />
                <input type="hidden" name={field} value={i.id} />
                <button
                  type="submit"
                  className="text-text-dim hover:text-danger"
                >
                  ✕
                </button>
              </form>
            </div>
          ))
        )}
      </div>
      {available.length > 0 ? (
        <form action={addAction} className="mt-2 flex items-center gap-2">
          <input type="hidden" name="trackId" value={trackId} />
          <Select name={field} className="text-sm" defaultValue="">
            <option value="" disabled>
              add to…
            </option>
            {available.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="ghost">
            Add
          </Button>
        </form>
      ) : null}
    </div>
  );
}
