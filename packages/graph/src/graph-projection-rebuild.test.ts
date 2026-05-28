import { describe, expect, it, vi } from "vitest";
import { applyProjectionPlan } from "./graph-projection/apply-projection-plan.js";
import { buildProjectionPlan } from "./graph-projection/build-projection-plan.js";
import { clearNotebookProjectionScope, clearSourceProjectionScope } from "./graph-projection/clear-projection-scope.js";
import type { CanonicalProjectionSnapshot } from "./graph-projection/types.js";

function minimalSnapshot(scope: "notebook" | "source"): CanonicalProjectionSnapshot {
  return {
    notebookId: "nb_rebuild",
    scope,
    ...(scope === "source" ? { sourceId: "src_1" } : {}),
    sources: [{ id: "src_1", title: "Physics" }],
    concepts: [{ id: "cnc_1", canonicalName: "Force" }],
    claims: [{ id: "clm_1", sourceId: "src_1", claimText: "F = ma", conceptIds: ["cnc_1"] }],
    wikiPages: [],
    graphRelations: [],
    curricula: [],
    modules: [],
    objectiveLists: [],
    sessionPlans: [],
    objectives: [],
    studyPlans: [],
    coverageItems: [],
    coverageRecords: [],
  };
}

describe("projection rebuild scopes", () => {
  it("clears notebook-scoped derived nodes before replay", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const session = { run } as unknown as import("neo4j-driver").Session;
    await clearNotebookProjectionScope(session, "nb_rebuild");
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("DETACH DELETE"),
      expect.objectContaining({ notebookId: "nb_rebuild" }),
    );
  });

  it("clears source-scoped relationships, topics, claims, wiki pages, and source-owned nodes before replay", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const session = { run } as unknown as import("neo4j-driver").Session;
    await clearSourceProjectionScope(session, "nb_rebuild", "src_1");
    expect(run).toHaveBeenCalledTimes(6);
    expect(run.mock.calls[0]?.[0]).toContain("DETACH DELETE owned, cur");
    expect(run.mock.calls[1]?.[0]).toContain("DELETE r");
    expect(run.mock.calls[5]?.[0]).toContain("NOT n:Concept");
  });

  it("replays the same projection plan idempotently", async () => {
    const plan = buildProjectionPlan(minimalSnapshot("source"));
    const run = vi.fn().mockResolvedValue({ records: [] });
    const session = { run } as unknown as import("neo4j-driver").Session;

    await applyProjectionPlan(session, plan);
    const firstCallCount = run.mock.calls.length;
    await applyProjectionPlan(session, plan);
    expect(run.mock.calls.length).toBe(firstCallCount * 2);
    expect(buildProjectionPlan(minimalSnapshot("source")).operations).toEqual(plan.operations);
  });
});
