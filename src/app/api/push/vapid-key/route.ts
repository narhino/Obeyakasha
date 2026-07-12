import { env } from "@/lib/env";

/** Public VAPID key for the client to subscribe to push. Null until configured. */
export async function GET() {
  return Response.json({ key: env.VAPID_PUBLIC_KEY ?? null });
}
