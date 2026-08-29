import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { sendSubjectMessage } from "@/lib/messages/ops";
import { logAudit } from "@/lib/audit";

/**
 * "It won't work on my phone."
 *
 * THE FAILURE THIS EXISTS FOR: the threshold is a full-screen wall with one
 * action on it, and when that action cannot succeed on someone's device there
 * is no way forward AND no way to say so. A member who denied notifications
 * once cannot be re-prompted by any script; an install prompt that never fires
 * cannot be summoned. Those people were permanently locked out of something
 * they pay for, with no route to her — so the only place left to say it was a
 * public comment, which is exactly where it was said.
 *
 * This turns a silent lockout into a message she can act on, with the device
 * facts attached so she doesn't have to interview anyone: she reads which step
 * they're stuck at and what their browser reports, and releases them from their
 * profile in one click.
 *
 * Deliberately does NOT unlock anything by itself. The threshold is her rule;
 * this asks her, it doesn't overrule her.
 */
const schema = z.object({
  step: z.enum(["install", "notifications", "reverify"]),
  standalone: z.boolean(),
  permission: z.enum(["granted", "denied", "default", "unsupported"]),
  // A short UA-derived label from the client. Bounded, and only ever used to
  // describe the DEVICE in her message — never stored as a profile field.
  device: z.string().max(120).optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What she needs to know, in one line she can read at a glance. */
function diagnosis(d: z.infer<typeof schema>): string {
  const step =
    d.step === "install"
      ? "can't get it onto their home screen"
      : d.step === "notifications"
        ? "can't turn notifications on"
        : "can't prove notifications arrive";
  const why =
    d.permission === "denied"
      ? " Their browser has notifications BLOCKED — no button on our side can ask again; it has to be changed in their phone's settings, or you release them."
      : d.permission === "unsupported"
        ? " Their browser can't do web notifications at all."
        : d.step === "install" && !d.standalone
          ? " Their browser never offered the install prompt — common after signing in through Patreon, and Samsung Internet never offers it."
          : "";
  return (
    `[Stuck at the threshold] They ${step}.${why}` +
    `\n\nDevice: ${d.device ?? "unknown"} · installed: ${d.standalone ? "yes" : "no"} · notifications: ${d.permission}` +
    `\n\nYou can let them straight in from their profile — "Release from the threshold".`
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  return withSubject(async (userId) => {
    const sent = await sendSubjectMessage(userId, diagnosis(parsed.data));
    // The audit row goes in EITHER WAY. Someone's daily message quota must not
    // be able to swallow the one message that says they can't get in — if the
    // send was refused she can still find them here.
    await logAudit(userId, "gate.stuck_reported", {
      step: parsed.data.step,
      permission: parsed.data.permission,
      standalone: parsed.data.standalone,
      delivered: sent.ok,
    });
    // Told plainly rather than pretended: if it didn't reach her, they need to
    // know to use another door instead of waiting on an answer that isn't coming.
    return { ok: true, delivered: sent.ok };
  });
}
