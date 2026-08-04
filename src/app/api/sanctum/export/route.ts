import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { buildCorpus } from "@/lib/export/corpus";

/**
 * The whole membership as a folder of files, for working on elsewhere (F1).
 *
 * Goddess-only and audited: this is every member's private words leaving the
 * server in one download, and there should be a record of every time it happens.
 * Contact details are opt-in via `?contacts=1`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A few hundred members with long threads takes real time to assemble.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "goddess") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const contacts = req.nextUrl.searchParams.get("contacts") === "1";

  const { bytes, count } = await buildCorpus({ contacts });
  await logAudit(session.user.id, "corpus.exported", { count, contacts });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="akasha-members-${stamp}.zip"`,
      // Never let a proxy or the service worker hold a copy of this.
      "Cache-Control": "no-store, private",
    },
  });
}
