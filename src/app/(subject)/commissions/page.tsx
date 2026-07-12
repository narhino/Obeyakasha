import { requireSubject } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { getCommissionForm } from "@/lib/commissions/form";
import { CommissionForm } from "@/components/commissions/CommissionForm";
import { Display, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

export default async function CommissionsPage() {
  await requireSubject();
  const [open, fields] = await Promise.all([
    getSetting("commissions_open"),
    getCommissionForm(),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display className="text-3xl">
        {open ? copy.comm.openTitle : "Commissions are sealed"}
      </Display>
      <Whisper className="mt-1">
        {open ? copy.comm.openBody : copy.comm.sealed}
      </Whisper>
      <CommissionForm fields={fields} open={open} />
    </main>
  );
}
