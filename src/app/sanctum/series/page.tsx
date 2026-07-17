import { redirect } from "next/navigation";

// Series moved into the merged Collections page (R-organize). The editor UI and
// its server actions (./actions, ./SeriesCover) still live here.
export default function SanctumSeriesRedirect() {
  redirect("/sanctum/collections");
}
