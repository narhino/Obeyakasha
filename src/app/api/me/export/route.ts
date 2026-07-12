import { auth } from "@/auth";
import { exportUserData } from "@/lib/privacy/export";

/** Download everything we hold about you (A21 / GDPR). */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const data = await exportUserData(session.user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="akasha-my-data.json"',
    },
  });
}
