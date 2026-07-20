import { withGoddess } from "@/lib/api";
import { subjectsInRoom } from "@/lib/presence/room";

/**
 * The Sanctum "In the room" feed (F4) — GODDESS-ONLY. Subjects present within the
 * window, with the names she gave them and their level. Never reachable by a
 * subject (D7); the /api/sanctum prefix is role-gated in middleware and here.
 */
export async function GET() {
  return withGoddess(async () => {
    const room = await subjectsInRoom();
    return { room };
  });
}
