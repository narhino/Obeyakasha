import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { offlineGrants } from "@/lib/db/schema";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getAccessibleTrack } from "@/lib/library/queries";
import { mediaProvider } from "@/lib/media";
import { getSetting } from "@/lib/settings";

const schema = z.object({
  trackId: z.string().uuid(),
  deviceId: z.string().uuid(),
});

/** Authorize keeping a track offline (D4). Records a grant, returns a URL. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) => {
    const downloadsOn = await getSetting("downloads_enabled");
    if (!downloadsOn) return { ok: false, reason: "disabled" };

    const access = await resolveAccess(userId);
    const track = await getAccessibleTrack(parsed.data.trackId, userId, access.accessLevel);
    if (!track || !track.streamKey || !track.downloadable) {
      return { ok: false, reason: "not_allowed" };
    }

    const ttlDays = await getSetting("offline_ttl_days");
    await db
      .insert(offlineGrants)
      .values({
        userId,
        trackId: parsed.data.trackId,
        deviceId: parsed.data.deviceId,
        keyWrapped: "device-held", // key never leaves the device (§10)
        expiresAt: new Date(Date.now() + ttlDays * 86400000),
      })
      .onConflictDoUpdate({
        target: [offlineGrants.userId, offlineGrants.trackId, offlineGrants.deviceId],
        set: {
          revoked: false,
          expiresAt: new Date(Date.now() + ttlDays * 86400000),
        },
      });

    const url = await mediaProvider().signStreamUrl(track.streamKey, 3600);
    return { ok: true, url, ttlDays };
  });
}
