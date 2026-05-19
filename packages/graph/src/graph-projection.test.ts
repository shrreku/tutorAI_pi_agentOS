import { describe, expect, it } from "vitest";
import { buildProjectionPlan } from "./graph-projection/build-projection-plan.js";
import {
  computeProjectionLagSeconds,
  deriveHealthStatus,
  learnerWarningForHealth,
} from "./graph-projection/projection-health.js";
import type { CanonicalProjectionSnapshot } from "./graph-projection/types.js";
import { stableTopicId } from "./graph-projection/topic.js";

function baseSnapshot(overrides: Partial<CanonicalProjectionSnapshot> = {}): CanonicalProjectionSnapshot {
  return {
    notebookId: "nb_test",
    scope: "notebook",
    sources: [{ id: "src_a", title: "Thermodynamics" }],
    concepts: [{ id: "cnc_volt", canonicalName: "Voltage" }],
    claims: [
      {
        id: "clm_1",
        sourceId: "src_a",
        claimText: "Voltage drives current.",
        conceptIds: ["cnc_volt"],
      },
    ],
    wikiPages: [
      {
        id: "wp_summary",
        pageType: "source_summary",
        pageKey: "source:src_a",
        title: "Source · Thermodynamics",
        linkedConceptId: null,
        sourceId: "src_a",
      },
      {
        id: "wp_concept",
        pageType: "concept",
        pageKey: "concept:cnc_volt",
        title: "Concept · Voltage",
        linkedConceptId: "cnc_volt",
        sourceId: "src_a",
      },
    ],
    graphRelations: [
      {
        sourceNodeType: "concept",
        sourceNodeId: "cnc_volt",
        targetNodeType: "concept",
        targetNodeId: "cnc_volt",
        relationType: "depends_on",
        confidence: 0.8,
      },
      {
        sourceNodeType: "claim",
        sourceNodeId: "clm_winner",
        targetNodeType: "claim",
        targetNodeId: "clm_loser",
        relationType: "supersedes",
        confidence: null,
      },
    ],
    curricula: [{ id: "cur_1", title: "Thermo course", sourceIds: ["src_a"] }],
    modules: [
      {
        id: "mod_1",
        curriculumId: "cur_1",
        title: "Understand Voltage",
        summary: "Build understanding",
        orderIndex: 0,
        status: "active",
      },
    ],
    objectiveLists: [
      {
        id: "olist_1",
        curriculumId: "cur_1",
        moduleId: "mod_1",
        title: "Active objective list",
        status: "active",
        objectiveIdsOrdered: ["obj_1"],
      },
    ],
    sessionPlans: [
      {
        id: "sess_1",
        curriculumId: "cur_1",
        moduleId: "mod_1",
        objectiveListId: "olist_1",
        title: "First session",
        status: "active",
        sessionGoal: "Learn essentials",
      },
    ],
    objectives: [
      {
        id: "obj_1",
        curriculumId: "cur_1",
        title: "Explain Voltage",
        orderIndex: 0,
        status: "not_started",
      },
    ],
    studyPlans: [
      {
        id: "plan_1",
        title: "Living study plan",
        currentObjectiveId: "obj_1",
        upcomingObjectiveIds: [],
      },
    ],
    coverageItems: [{ id: "cov_1", sourceId: "src_a", title: "Definition", itemFamily: "definition" }],
    coverageRecords: [{ id: "covrec_1", coverageItemId: "cov_1", status: "planned" }],
    ...overrides,
  };
}

describe("buildProjectionPlan from canonical rows", () => {
  it("builds ordered graph operations for a notebook snapshot", () => {
    const plan = buildProjectionPlan(baseSnapshot());
    const kinds = plan.operations.map((op) => op.kind);
    expect(kinds[0]).toBe("merge_notebook");
    expect(kinds).toContain("merge_source");
    expect(kinds).toContain("merge_concepts");
    expect(kinds).toContain("merge_curriculum");
    expect(kinds).toContain("merge_claim");
    expect(kinds).toContain("merge_wiki_page");
    expect(kinds).toContain("merge_study_plan");
    expect(kinds.filter((k) => k === "merge_claim_supersedes")).toHaveLength(1);
  });

  it("builds source-scoped operations without notebook-wide study plan when absent", () => {
    const plan = buildProjectionPlan(
      baseSnapshot({
        scope: "source",
        sourceId: "src_a",
        studyPlans: [],
      }),
    );
    const kinds = plan.operations.map((op) => op.kind);
    expect(kinds).toContain("merge_topic");
    expect(kinds).toContain("link_topic_concept");
    expect(kinds).not.toContain("merge_study_plan");
    const topicOp = plan.operations.find((op) => op.kind === "merge_topic");
    expect(topicOp && topicOp.kind === "merge_topic" ? topicOp.topicId : null).toBe(
      stableTopicId("src_a", "Thermo course"),
    );
  });

  it("handles missing optional curriculum rows without failing", () => {
    const plan = buildProjectionPlan(
      baseSnapshot({
        curricula: [],
        modules: [],
        objectiveLists: [],
        sessionPlans: [],
        objectives: [],
        studyPlans: [],
        coverageItems: [],
        coverageRecords: [],
      }),
    );
    expect(plan.operations.length).toBeGreaterThan(0);
    expect(plan.operations.map((op) => op.kind)).toContain("merge_source");
  });

  it("is idempotent for the same canonical snapshot", () => {
    const snapshot = baseSnapshot();
    const first = buildProjectionPlan(snapshot);
    const second = buildProjectionPlan(snapshot);
    expect(second.operations).toEqual(first.operations);
  });
});

describe("projection health", () => {
  it("marks stale when canonical rows are newer than last projection", () => {
    const lastProjectedAt = new Date("2026-05-15T10:00:00Z");
    const canonicalUpdatedAt = new Date("2026-05-15T10:10:00Z");
    const lag = computeProjectionLagSeconds(lastProjectedAt, canonicalUpdatedAt);
    expect(lag).toBe(600);
    expect(deriveHealthStatus("healthy", lag, null)).toBe("stale");
  });

  it("marks failed when a failure reason is present", () => {
    expect(deriveHealthStatus("healthy", 0, "Neo4j unavailable")).toBe("failed");
  });

  it("returns learner-safe warnings without Neo4j terminology", () => {
    expect(learnerWarningForHealth({ scope: "notebook", status: "stale" })).toContain("Study Map");
    expect(learnerWarningForHealth({ scope: "source", status: "failed" })).toContain("Source Wiki");
    expect(learnerWarningForHealth({ scope: "notebook", status: "healthy" })).toBeNull();
  });
});

describe("notebook rebuild planning", () => {
  it("can rebuild projection for a notebook with multiple sources", () => {
    const plan = buildProjectionPlan(
      baseSnapshot({
        sources: [
          { id: "src_a", title: "A" },
          { id: "src_b", title: "B" },
        ],
        claims: [
          { id: "clm_a", sourceId: "src_a", claimText: "A", conceptIds: ["cnc_volt"] },
          { id: "clm_b", sourceId: "src_b", claimText: "B", conceptIds: ["cnc_volt"] },
        ],
      }),
    );
    const sourceIds = plan.operations
      .filter((op) => op.kind === "merge_source")
      .map((op) => (op.kind === "merge_source" ? op.sourceId : ""));
    expect(sourceIds).toEqual(expect.arrayContaining(["src_a", "src_b"]));
  });
});
