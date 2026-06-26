import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type DbClient = ReturnType<typeof createDb>;

export async function pingDatabase(dbClient: DbClient): Promise<void> {
  await dbClient.sql`select 1`;
}

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10, prepare: false });
  const db = drizzle(client, { schema });
  return { db, sql: client };
}
