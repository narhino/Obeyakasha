import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Server-side guard: returns the session or redirects. Use in server components. */
export async function requireSubject() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

/** Server-side guard for the Sanctum. Redirects non-goddess users away. */
export async function requireGoddess() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "goddess") redirect("/library");
  return session;
}
