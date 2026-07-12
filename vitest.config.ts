import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://postgres:postgres@localhost:5432/obeyakasha_test",
      AUTH_SECRET: "test-secret-0000000000000000000000000000",
      MEDIA_LOCAL_DIR: "./media-test",
      VAPID_PUBLIC_KEY: "test-vapid-public",
      VAPID_PRIVATE_KEY: "test-vapid-private",
      VAPID_SUBJECT: "mailto:test@example.com",
    },
    // DB integration tests share one Postgres; run serially to avoid clashes.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
