import { z } from "zod";
import { getRawSetting, setRawSetting } from "@/lib/settings";

/**
 * Commission form config (D2 / PLAN §14.1). Admin-editable field list stored in
 * settings. Seed reflects Akasha's Google Form; she edits it in the Sanctum.
 */
export const commissionFieldSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(200),
  type: z.enum(["short", "long", "choice", "multichoice"]),
  required: z.boolean().default(false),
  options: z.array(z.string().max(120)).optional(),
});
export type CommissionField = z.infer<typeof commissionFieldSchema>;

export const SEED_FIELDS: CommissionField[] = [
  { id: "identify", label: "How should I identify you?", type: "short", required: true },
  {
    id: "type",
    label: "What kind of commission?",
    type: "choice",
    required: true,
    options: [
      "Personal hypnosis file",
      "Custom script",
      "Extended version of an existing file",
      "Video with spiral",
      "Other",
    ],
  },
  { id: "scenario", label: "Theme & scenario — tell me everything.", type: "long", required: true },
  { id: "triggers", label: "Triggers to install or include.", type: "long", required: false },
  { id: "limits", label: "Hard limits — what must I never do?", type: "long", required: true },
  {
    id: "length",
    label: "Desired length",
    type: "choice",
    required: false,
    options: ["Under 15 min", "15–30 min", "30–60 min", "60+ min"],
  },
  { id: "closest", label: "Which of my files is closest to what you crave?", type: "short", required: false },
  { id: "deadline", label: "Any deadline or urgency?", type: "short", required: false },
  {
    id: "budget",
    label: "Budget range",
    type: "choice",
    required: false,
    options: ["$50–100", "$100–250", "$250–500", "$500+"],
  },
  {
    id: "privacy",
    label: "Private to you, or may I release it?",
    type: "choice",
    required: true,
    options: ["Strictly mine", "You may publish it", "You may publish it renamed"],
  },
  { id: "anything", label: "Anything else I must know?", type: "long", required: false },
];

const FORM_KEY = "commission_form";

export async function getCommissionForm(): Promise<CommissionField[]> {
  const raw = await getRawSetting<CommissionField[] | null>(FORM_KEY, null);
  if (!raw) return SEED_FIELDS;
  const parsed = z.array(commissionFieldSchema).safeParse(raw);
  return parsed.success ? parsed.data : SEED_FIELDS;
}

export async function setCommissionForm(fields: CommissionField[]): Promise<void> {
  await setRawSetting(FORM_KEY, fields);
}
