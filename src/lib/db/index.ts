import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Postgres connection + Drizzle client. A single pooled client is reused
 * across the server runtime (Next dev HMR safe via globalThis cache).
 */
const globalForDb = globalThis as unknown as {
  __obey_sql?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__obey_sql ??
  postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === "production" ? 10 : 5,
    prepare: false,
    onnotice: () => {}, // suppress NOTICE noise (e.g. TRUNCATE cascades in tests)
  });

if (env.NODE_ENV !== "production") globalForDb.__obey_sql = client;

export const db = drizzle(client, { schema });
export { schema };
export type DB = typeof db;
