import { z } from "zod";

/**
 * Central, validated environment access (PLAN §21/§24). Import `env` — never
 * read process.env directly elsewhere. Optional vars are gated so the app
 * boots in early milestones before every integration is configured.
 */
/** The stand-in secret that lets dev/test boot. Never valid in production. */
const DEV_AUTH_SECRET = "dev-insecure-secret-change-me";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1).default(DEV_AUTH_SECRET),

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
  // Heavy dossier analysis model (ROADMAP Phase D). Set in .env to a top-tier
  // model id; falls back to the organize model when unset.
  LLM_ANALYZE_MODEL: z.string().optional(),
  LLM_TASK_ORGANIZE: z.string().default("anthropic"),
  LLM_TASK_TRIAGE: z.string().default("anthropic"),
  LLM_TASK_CLUSTER: z.string().default("anthropic"),
  LLM_TASK_DRAFTS: z.string().default("anthropic"),
  BACKUP_AGE_RECIPIENT: z.string().optional(),
});

/**
 * SECURITY — AUTH_SECRET signs the session JWT *and* the media stream tokens.
 * If production ever booted on the published dev fallback, anyone could mint a
 * goddess session and sign their own stream URLs, so a real secret is a hard
 * requirement there (dev/test keep the convenient fallback).
 */
function assertProductionSecrets(v: z.infer<typeof schema>): string[] {
  if (v.NODE_ENV !== "production") return [];
  if (v.AUTH_SECRET === DEV_AUTH_SECRET) {
    return [
      "  AUTH_SECRET: still the insecure development default — set a real one (`openssl rand -base64 32`)",
    ];
  }
  if (v.AUTH_SECRET.length < 32) {
    return ["  AUTH_SECRET: too short — use at least 32 characters"];
  }
  return [];
}

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const unsafe = assertProductionSecrets(parsed.data);
  if (unsafe.length > 0) {
    throw new Error(`Invalid environment:\n${unsafe.join("\n")}`);
  }
  return parsed.data;
}

export const env = load();
export type Env = z.infer<typeof schema>;
