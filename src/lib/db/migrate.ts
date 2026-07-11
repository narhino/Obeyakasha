import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Standalone migration runner (pnpm db:migrate). Uses its own short-lived client. */
async function main() {
  const url =
    process.env.DATABASE_URL ??
    "postgres://postgres:postgres@localhost:5432/obeyakasha";
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);
  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
