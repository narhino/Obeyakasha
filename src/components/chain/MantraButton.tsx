"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

/** Type the daily mantra to keep the chain (A7). */
export function MantraButton({ mantra }: { mantra: string }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "kept">("idle");
  const router = useRouter();

  const matches = value.trim().toLowerCase() === mantra.trim().toLowerCase();

  async function submit() {
    if (!matches) return;
    setState("saving");
    try {
      await fetch("/api/chain/mantra", { method: "POST" });
      setState("kept");
      router.refresh();
    } catch {
      setState("idle");
    }
  }

  if (state === "kept") {
    return <Whisper className="text-gold">You said it. Good.</Whisper>;
  }

  return (
    <div>
      <Whisper className="mb-1 text-xs">{copy.chain.mantraPrompt}</Whisper>
      <p className="mb-2 font-[family-name:var(--font-display)] italic text-text">
        &ldquo;{mantra}&rdquo;
      </p>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="say it for me"
          className="flex-1"
        />
        <Button
          variant="gold"
          size="sm"
          disabled={!matches || state === "saving"}
          onClick={submit}
        >
          Keep the chain
        </Button>
      </div>
    </div>
  );
}
