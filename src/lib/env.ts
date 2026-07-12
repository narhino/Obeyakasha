import { z } from "zod";

/**
 * Central, validated environment access (PLAN §21/§24). Import `env` — never
 * read process.env directly elsewhere. Optional vars are gated so the app
 * boots in early milestones before every integration is configured.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).default("dev-insecure-secret-change-me"),

  // Patreon (optional until M0 auth wiring is configured on an env)
  PATREON_CLIENT_ID: z.string().optional(),
  PATREON_CLIENT_SECRET: z.string().optional(),
  PATREON_CREATOR_ACCESS_TOKEN: z.string().optional(),
  PATREON_WEBHOOK_SECRET: z.string().optional(),
  ADMIN_PATREON_USER_ID: z.string().optional(),
  ADMIN_PATREON_EMAIL: z.string().optional(),

  // Later milestones
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  BUNNY_STORAGE_ZONE: z.string().optional(),
  BUNNY_STORAGE_KEY: z.string().optional(),
  BUNNY_CDN_HOST: z.string().optional(),
  BUNNY_TOKEN_KEY: z.string().optional(),
  TRANSCRIBER_URL: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(), // optional paid STT alternative
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  LLM_ORGANIZE_MODEL: z.string().optional(),
  LLM_TASK_ORGANIZE: z.string().default("anthropic"),
  LLM_TASK_TRIAGE: z.string().default("anthropic"),
  LLM_TASK_CLUSTER: z.string().default("anthropic"),
  LLM_TASK_DRAFTS: z.string().default("anthropic"),
  BACKUP_AGE_RECIPIENT: z.string().optional(),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export const env = load();
export type Env = z.infer<typeof schema>;
