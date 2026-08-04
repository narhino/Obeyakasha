import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { buildAsksDoc } from "@/lib/export/asks";

/**
 * Every ask as one markdown document, for writing the next script from.
 * Goddess-only and audited — it carries members' own words off the server.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "goddess") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const { markdown, count } = await buildAsksDoc();
  await logAudit(session.user.id, "asks.exported", { count });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="akasha-asks-${stamp}.md"`,
      "Cache-Control": "no-store, private",
    },
  });
}
