"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

type State = "idle" | "sending" | "done";

/**
 * "Petition her" — the Ask form on the You page. Posts a titled wish into the
 * wishbox; the server notifies the goddess. On success it refreshes so the
 * subject's own asks list below picks up the new petition.
 */
export function PetitionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<State>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          body: trimmed,
        }),
      });
      if (!res.ok) throw new Error("failed");
      setTitle("");
      setBody("");
      setState("done");
      router.refresh();
    } catch {
      setState("idle");
    }
  }

  const inputCls =
    "rounded-[var(--radius)] border border-line bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-text-dim/45 transition-colors duration-[var(--dur-med)] focus:border-gold/70 focus:outline-none";

  return (
    <Card>
      <Display as="h2" className="text-xl">
        {copy.ask.cardTitle}
      </Display>
      <Whisper className="mt-1">{copy.ask.cardBody}</Whisper>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">{copy.ask.titleLabel}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder={copy.ask.titlePlaceholder}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-caps">{copy.ask.bodyLabel}</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            rows={4}
            required
            placeholder={copy.ask.bodyPlaceholder}
            className={`${inputCls} resize-y`}
          />
        </label>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="gold"
            loading={state === "sending"}
            disabled={!body.trim()}
          >
            {state === "sending" ? copy.ask.submitting : copy.ask.submit}
          </Button>
          {state === "done" ? (
            <Whisper className="text-xs">{copy.ask.submitted}</Whisper>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
