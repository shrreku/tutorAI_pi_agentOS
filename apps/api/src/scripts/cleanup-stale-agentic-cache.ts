import { loadEnv } from "@studyagent/config";
import { createDb, deleteAgenticCacheByNamespace } from "@studyagent/db";

const STALE_NAMESPACES = ["tutor_turn.host_context_snapshot"] as const;
const dryRun = process.argv.includes("--dry-run");

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

for (const namespace of STALE_NAMESPACES) {
  if (dryRun) {
    const rows = await db.sql<{ count: string }[]>`
      select count(*)::text as count
      from agentic_cache_entries
      where namespace = ${namespace}
    `;
    const count = Number(rows[0]?.count ?? 0);
    console.log(`[dry-run] would delete ${count} rows in namespace ${namespace}`);
    continue;
  }

  const deleted = await deleteAgenticCacheByNamespace(db, { namespace });
  console.log(`deleted ${deleted} rows in namespace ${namespace}`);
}

await db.sql.end();
