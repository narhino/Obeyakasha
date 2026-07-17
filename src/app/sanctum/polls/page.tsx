import { redirect } from "next/navigation";

// Polls moved into a section beneath the Whispers composer (R-organize). The
// management UI (../whispers/PollsPanel) and poll actions (./actions) still live
// where they were.
export default function SanctumPollsRedirect() {
  redirect("/sanctum/whispers");
}
