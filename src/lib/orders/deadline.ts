import { copy, fill } from "@/copy/copy";

export interface TaskDeadline {
  /** In-voice chip label, e.g. "3h to obey" / "2 days late". */
  label: string;
  /** Past the deadline — the card + chip take danger styling. */
  overdue: boolean;
}

/**
 * In-voice relative deadline chip for a task (R5). PURE — safe on the client,
 * no DB. Buckets coarsely (sub-hour / hours / days) so the copy stays in
 * Akasha's voice; an overdue task reads as danger, never hidden.
 */
export function taskDeadline(dueAt: Date, now: Date = new Date()): TaskDeadline {
  const ms = dueAt.getTime() - now.getTime();
  const overdue = ms < 0;
  const absMs = Math.abs(ms);
  const hours = absMs / 3_600_000;
  const days = Math.floor(hours / 24);
  const d = copy.tasks.deadline;

  if (overdue) {
    return {
      overdue: true,
      label: days >= 1 ? fill(d.overdueDays, { n: days }) : d.overdueNow,
    };
  }
  if (hours < 1) return { overdue: false, label: d.soon };
  if (days < 1) {
    return { overdue: false, label: fill(d.hours, { n: Math.max(1, Math.round(hours)) }) };
  }
  return { overdue: false, label: fill(d.days, { n: days }) };
}
