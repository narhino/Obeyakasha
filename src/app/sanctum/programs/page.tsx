import { redirect } from "next/navigation";

// Programs (Trainings) moved into the merged Collections page (R-organize). The
// editor UI and its server actions (./actions) still live here.
export default function SanctumProgramsRedirect() {
  redirect("/sanctum/collections");
}
