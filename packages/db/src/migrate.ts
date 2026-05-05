import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const migrationsFolder = path.resolve(__dirname, "../../../infra/migrations/drizzle");
  const client = postgres(url, { max: 1, prepare: false });
  await client`CREATE EXTENSION IF NOT EXISTS vector`;
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  await client.end();
  console.log("Migrations applied from", migrationsFolder);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
