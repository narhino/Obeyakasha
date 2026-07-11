import { auth } from "@/auth";

/** Wraps a subject-authenticated JSON handler. Returns 401 if not signed in. */
export async function withSubject<T>(
  handler: (userId: string) => Promise<T>,
): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const data = await handler(session.user.id);
    return Response.json(data ?? { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    return Response.json({ error: message }, { status: 400 });
  }
}
