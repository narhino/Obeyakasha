"use server";

import { revalidatePath } from "next/cache";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import {
  deliverCommission,
  notifyWaitlistReopened,
  setCommissionStage,
  setCommissionStatus,
  type CommissionStatus,
} from "@/lib/commissions/ops";
import type { CommissionStage } from "@/lib/commissions/stages";

export async function toggleCommissions() {
  const session = await requireGoddess();
  const open = await getSetting("commissions_open");
  await setSetting("commissions_open", !open);
  if (!open) await notifyWaitlistReopened(session.user.id); // was closed → now open
  await logAudit(session.user.id, "commissions.toggled", { open: !open });
  revalidatePath("/sanctum/commissions");
}

export async function updateCommissionStatus(formData: FormData) {
  const session = await requireGoddess();
  const id = String(formData.get("commissionId"));
  const status = String(formData.get("status")) as CommissionStatus;
  await setCommissionStatus(id, status);
  await logAudit(session.user.id, "commission.status", { id, status });
  revalidatePath("/sanctum/commissions");
}

export async function updateCommissionStage(formData: FormData) {
  const session = await requireGoddess();
  const id = String(formData.get("commissionId"));
  const stage = String(formData.get("stage")) as CommissionStage;
  await setCommissionStage(id, stage, session.user.id);
  await logAudit(session.user.id, "commission.stage", { id, stage });
  revalidatePath("/sanctum/commissions");
}

export async function deliverCommissionAction(formData: FormData) {
  const session = await requireGoddess();
  const id = String(formData.get("commissionId"));
  const trackId = String(formData.get("trackId"));
  if (!trackId) throw new Error("Pick a track");
  await deliverCommission(id, trackId, session.user.id);
  await logAudit(session.user.id, "commission.delivered", { id, trackId });
  revalidatePath("/sanctum/commissions");
}
