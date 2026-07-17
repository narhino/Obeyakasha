import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getAccessibleTrack, getSampleTrack } from "@/lib/library/queries";
import { isPremiereSealed } from "@/lib/premiere/logic";
import { mediaProvider } from "@/lib/media";

/**
 * Issues a short-lived signed stream URL after checking the viewer may hear the
 * track (PLAN §7.3). This is the ONLY place access is enforced before playback;
 * the stream route itself only trusts the signature it produced here.
 *
 * Two ways in:
 *  1. A signed-in subject entitled to the track (level or a private grant).
 *  2. ANYONE — logged-out included — when the track is a published free sample
 *     (R9.8). The public free-funnel taste; falls through to (2) whenever (1)
 *     doesn't apply, so an under-levelled subject can taste a sample too.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  let track: Awaited<ReturnType<typeof getAccessibleTrack>> = null;
  if (session?.user) {
    const access = await resolveAccess(session.user.id);
    track = await getAccessibleTrack(id, session.user.id, access.accessLevel);
  }
  // Not entitled (or not signed in) → only a published free sample streams.
  if (!track) track = await getSampleTrack(id);

  if (!track || !track.streamKey) {
    return Response.json({ error: "not_found_or_sealed" }, { status: 404 });
  }

  // Premiere seal (R9.6): a still-future premiere refuses playback for EVERYONE —
  // entitled subjects and free-sample tasters alike — until its appointed moment.
  // The free-sample flag does not bypass it; anticipation is the point.
  if (isPremiereSealed(track.premiereAt)) {
    return Response.json({ error: "not_found_or_sealed" }, { status: 404 });
  }

  const url = await mediaProvider().signStreamUrl(track.streamKey, 6 * 60 * 60);
  return Response.json({ url, expiresIn: 6 * 60 * 60 });
}
