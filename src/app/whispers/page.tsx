import { redirect } from "next/navigation";

/**
 * The Whispers feed moved to `/` (Home) in R1. Keep this path as a permanent
 * redirect so old links + push deep-links still land on the feed.
 */
export default function WhispersRedirect() {
  redirect("/");
}
