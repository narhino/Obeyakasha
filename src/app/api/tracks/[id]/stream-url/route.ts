import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getAccessibleTrack } from "@/lib/library/queries";
import { mediaProvider } from "@/lib/media";

/**
 * Issues a short-lived signed stream URL after checking the subject is entitled
 * to the track (PLAN §7.3). This is the ONLY place access is enforced before
 * playback; the stream route itself only trusts the signature it produced here.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await resolveAccess(session.user.id);
  const track = await getAccessibleTrack(id, access.accessLevel);
  if (!track || !track.streamKey) {
    return Response.json({ error: "not_found_or_sealed" }, { status: 404 });
  }

  const url = await mediaProvider().signStreamUrl(track.streamKey, 6 * 60 * 60);
  return Response.json({ url, expiresIn: 6 * 60 * 60 });
}
