import { withGoddess } from "@/lib/api";
import { liveListeners } from "@/lib/listen/live";

/**
 * The live room (R9.1) — who is under right now. Goddess-only; the Sanctum "Now,
 * under" panel polls this every ~10s. Never reaches a subject (D7).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return withGoddess(async () => ({ live: await liveListeners() }));
}
