import { Display, Whisper } from "@/components/ui";
import { liveListeners } from "@/lib/listen/live";
import { LivePanel } from "./LivePanel";

/**
 * The live room (R9.1) — everyone currently under, updating in real time, with
 * one-tap and free-text touch. Goddess-only (the Sanctum layout gates it).
 */
export const dynamic = "force-dynamic";

export default async function SanctumLive() {
  const initial = await liveListeners();
  return (
    <div className="max-w-2xl">
      <Display size="opener">Now, under</Display>
      <Whisper className="mt-1">
        Who is listening this moment. Reach in — she&apos;ll feel your hand on
        the back of her neck, no notification, just your voice surfacing.
      </Whisper>
      <div className="mt-6">
        <LivePanel initial={initial} />
      </div>
    </div>
  );
}
