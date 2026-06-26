import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DbClient } from "./client.js";
import { agenticCacheEntries } from "./schema/index.js";

export type AgenticCacheScope = {
  namespace: string;
  scopeType: "notebook" | "user" | "session" | "source" | "objective" | "global";
  scopeId: string;
  version: string;
};

export type AgenticCacheKeyInput = AgenticCacheScope & {
  parts: unknown[];
};

export function buildAgenticCacheKey(input: AgenticCacheKeyInput): string {
  const raw = stableJsonStringify({
    namespace: input.namespace,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    version: input.version,
    parts: input.parts,
  });
  return `acache_${createHash("sha256").update(raw).digest("hex")}`;
}

export async function getAgenticCacheEntry<T extends Record<string, unknown>>(
  dbClient: DbClient,
  input: { cacheKey: string; now?: Date },
): Promise<T | null> {
  const now = input.now ?? new Date();
  const [row] = await dbClient.db
    .select({
      valueJson: agenticCacheEntries.valueJson,
      expiresAt: agenticCacheEntries.expiresAt,
    })
    .from(agenticCacheEntries)
    .where(eq(agenticCacheEntries.cacheKey, input.cacheKey))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
    await dbClient.db
      .delete(agenticCacheEntries)
      .where(eq(agenticCacheEntries.cacheKey, input.cacheKey));
    return null;
  }

  await dbClient.db
    .update(agenticCacheEntries)
    .set({
      hitCount: sql`${agenticCacheEntries.hitCount} + 1`,
      lastHitAt: now,
      updatedAt: now,
    })
    .where(eq(agenticCacheEntries.cacheKey, input.cacheKey));
  return row.valueJson as T;
}

export async function setAgenticCacheEntry(
  dbClient: DbClient,
  input: AgenticCacheScope & {
    cacheKey: string;
    value: Record<string, unknown>;
    ttlMs?: number;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const expiresAt = input.ttlMs == null ? null : new Date(now.getTime() + input.ttlMs);
  await dbClient.db
    .insert(agenticCacheEntries)
    .values({
      cacheKey: input.cacheKey,
      namespace: input.namespace,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      version: input.version,
      valueJson: input.value,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agenticCacheEntries.cacheKey,
      set: {
        namespace: input.namespace,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        version: input.version,
        valueJson: input.value,
        expiresAt,
        updatedAt: now,
      },
    });
}

export async function deleteAgenticCacheByNamespace(
  dbClient: DbClient,
  input: { namespace: string },
): Promise<number> {
  const rows = await dbClient.db
    .delete(agenticCacheEntries)
    .where(eq(agenticCacheEntries.namespace, input.namespace))
    .returning({ cacheKey: agenticCacheEntries.cacheKey });
  return rows.length;
}

export async function invalidateAgenticCacheScope(
  dbClient: DbClient,
  input: Partial<Pick<AgenticCacheScope, "namespace" | "version">> &
    Pick<AgenticCacheScope, "scopeType" | "scopeId">,
): Promise<number> {
  const conditions = [
    eq(agenticCacheEntries.scopeType, input.scopeType),
    eq(agenticCacheEntries.scopeId, input.scopeId),
  ];
  if (input.namespace) conditions.push(eq(agenticCacheEntries.namespace, input.namespace));
  if (input.version) conditions.push(eq(agenticCacheEntries.version, input.version));
  const rows = await dbClient.db
    .delete(agenticCacheEntries)
    .where(and(...conditions))
    .returning({ cacheKey: agenticCacheEntries.cacheKey });
  return rows.length;
}

export async function deleteExpiredAgenticCacheEntries(
  dbClient: DbClient,
  input: { now?: Date; limit?: number } = {},
): Promise<number> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 500;
  const rows = await dbClient.db.execute(sql`
    with expired as (
      select cache_key
      from agentic_cache_entries
      where expires_at is not null and expires_at < ${now}
      order by expires_at asc
      limit ${limit}
    )
    delete from agentic_cache_entries
    using expired
    where agentic_cache_entries.cache_key = expired.cache_key
    returning agentic_cache_entries.cache_key
  `);
  return (rows as unknown[]).length;
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJsonStringify(entry)}`)
    .join(",")}}`;
}
