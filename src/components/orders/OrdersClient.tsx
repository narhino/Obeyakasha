"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Label, Whisper } from "@/components/ui";
import { IconSeal } from "@/components/ui/icons";
import { taskDeadline } from "@/lib/orders/deadline";
import { copy } from "@/copy/copy";

export interface TaskItem {
  id: string;
  title: string;
  body: string | null;
  requires: "ack" | "text" | "none";
  proofMode: "none" | "optional" | "required";
  status: "sent" | "seen" | "done" | "lapsed";
  /** ISO string; the client renders an in-voice relative chip. */
  dueAt: string | null;
  praised: boolean;
  proofUrl: string | null;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/webp", "image/jpeg", "image/png"];

export function OrdersClient({ items }: { items: TaskItem[] }) {
  const active = items.filter((i) => i.status === "sent" || i.status === "seen");
  const history = items.filter(
    (i) => i.status === "done" || i.status === "lapsed",
  );

  return (
    <div className="mt-6 space-y-8">
      {active.length > 0 ? (
        <section className="space-y-3">
          <Label>{copy.tasks.activeTitle}</Label>
          {active.map((o) => (
            <ActiveTask key={o.id} task={o} />
          ))}
        </section>
      ) : null}

      {history.length > 0 ? (
        <section className="space-y-2">
          <Label>{copy.tasks.historyTitle}</Label>
          {history.map((o) => (
            <PastTask key={o.id} task={o} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

/** A deadline chip — danger when overdue, quiet otherwise. */
function Deadline({ dueAt }: { dueAt: string }) {
  const { label, overdue } = taskDeadline(new Date(dueAt));
  return <Badge tone={overdue ? "danger" : "neutral"}>{label}</Badge>;
}

function ActiveTask({ task }: { task: TaskItem }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState("");

  const [proofUrl, setProofUrl] = useState<string | null>(task.proofUrl);
  const [proofState, setProofState] = useState<"idle" | "sending" | "error">(
    "idle",
  );
  const [proofError, setProofError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const wantsProof = task.proofMode !== "none";
  const needsProof = task.proofMode === "required" && !proofUrl;
  const needsReply = task.requires === "text" && !text.trim();
  // Why the Obey button is greyed, surfaced on the control itself (F09).
  const blockedReason = needsProof
    ? copy.tasks.proof.mustAttach
    : needsReply
      ? copy.tasks.replyPlaceholder
      : null;

  async function uploadProof(file: File) {
    if (!ALLOWED.includes(file.type)) {
      setProofState("error");
      setProofError(copy.tasks.proof.wrongType);
      return;
    }
    if (file.size > MAX_BYTES) {
      setProofState("error");
      setProofError(copy.tasks.proof.tooBig);
      return;
    }
    setProofState("sending");
    setProofError(null);
    try {
      const res = await fetch(`/api/orders/${task.id}/proof`, {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { proofUrl?: string };
      setProofUrl(data.proofUrl ?? null);
      setProofState("idle");
    } catch {
      setProofState("error");
      setProofError(copy.tasks.proof.failed);
    }
  }

  async function complete() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${task.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: text || null }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
      router.refresh();
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <Card raised className={done ? "opacity-60" : ""}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-[family-name:var(--font-display)] text-lg leading-snug">
          {task.title}
        </p>
        {task.dueAt ? <Deadline dueAt={task.dueAt} /> : null}
      </div>
      {task.body ? <Whisper className="mt-1">{task.body}</Whisper> : null}

      {done ? (
        <Whisper className="mt-3 text-gold">{copy.tasks.done}</Whisper>
      ) : (
        <div className="mt-3 space-y-3">
          {wantsProof ? (
            <div className="flex items-start gap-3">
              {proofUrl ? (
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius)] border border-line/80 bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofUrl}
                    alt={copy.tasks.proof.yours}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={proofState === "sending"}
                  className="rounded-[var(--radius)] border border-line px-3 py-1.5 text-xs uppercase tracking-[0.1em] text-text-dim transition-colors duration-[var(--dur-med)] hover:border-gold/50 hover:text-gold disabled:opacity-40"
                >
                  {proofState === "sending"
                    ? copy.tasks.proof.sending
                    : proofUrl
                      ? copy.tasks.proof.replace
                      : copy.tasks.proof.add}
                </button>
                <p className="mt-1 text-[0.6875rem] text-text-dim/70">
                  {task.proofMode === "required"
                    ? copy.tasks.proof.required
                    : copy.tasks.proof.optional}
                </p>
                {proofState === "error" && proofError ? (
                  <p className="mt-1 text-[0.6875rem] text-danger">{proofError}</p>
                ) : null}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/webp,image/jpeg,image/png"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadProof(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          ) : null}

          {task.requires === "text" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder={copy.tasks.replyPlaceholder}
              className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/45 focus:border-gold focus:outline-none"
            />
          ) : null}

          <div>
            <Button
              variant="gold"
              size="sm"
              loading={submitting}
              disabled={submitting || needsProof || needsReply}
              onClick={complete}
            >
              {task.requires === "text"
                ? copy.tasks.obeyAction
                : copy.tasks.doneAction}
            </Button>
            {blockedReason && !submitting ? (
              <p className="mt-1.5 text-[0.6875rem] text-text-dim/70">
                {blockedReason}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

function PastTask({ task }: { task: TaskItem }) {
  const lapsed = task.status === "lapsed";
  return (
    <Card className="flex items-start justify-between gap-3 py-3 opacity-60">
      <div className="min-w-0">
        <p className="truncate text-sm text-text">{task.title}</p>
        <Whisper className="mt-0.5 text-xs">
          {lapsed ? copy.tasks.lapsed : copy.tasks.done}
        </Whisper>
        {task.praised ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] tracking-[0.08em] uppercase text-gold">
            <IconSeal size={13} />
            {copy.tasks.praise.seal}
          </span>
        ) : null}
      </div>
      {task.proofUrl ? (
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius)] border border-line/80 bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={task.proofUrl}
            alt={copy.tasks.proof.yours}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}
    </Card>
  );
}
