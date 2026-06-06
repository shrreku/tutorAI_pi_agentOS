import { describe, expect, it } from "vitest";
import { deleteAgenticCacheByNamespace } from "./agentic-cache.js";

describe("deleteAgenticCacheByNamespace", () => {
  it("deletes all cache rows for a namespace", async () => {
    const rows = [
      { cacheKey: "acache_1", namespace: "tutor_turn.host_context_snapshot", scopeType: "notebook", scopeId: "nb_1" },
      { cacheKey: "acache_2", namespace: "tutor_turn.retrieval_rows", scopeType: "notebook", scopeId: "nb_1" },
      { cacheKey: "acache_3", namespace: "tutor_turn.host_context_snapshot", scopeType: "notebook", scopeId: "nb_2" },
    ];
    const dbClient = {
      db: {
        delete: () => ({
          where: (condition: unknown) => ({
            returning: async () => {
              const deleted = rows.filter((row) => row.namespace === "tutor_turn.host_context_snapshot");
              for (const row of deleted) {
                const index = rows.findIndex((candidate) => candidate.cacheKey === row.cacheKey);
                if (index >= 0) rows.splice(index, 1);
              }
              return deleted.map((row) => ({ cacheKey: row.cacheKey }));
            },
          }),
        }),
      },
    } as never;

    const deleted = await deleteAgenticCacheByNamespace(dbClient, {
      namespace: "tutor_turn.host_context_snapshot",
    });

    expect(deleted).toBe(2);
    expect(rows.map((row) => row.cacheKey)).toEqual(["acache_2"]);
  });
});
