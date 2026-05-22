import { describe, expect, it } from "vitest";
import { artifacts, learningState, objectiveLists, objectives, studyPlans } from "@studyagent/db";
import type { AppContext } from "./context.js";
import { buildStudyMapReadModel } from "./workspace-read-model.js";

function makeCtx(overrides: {
  studyPlan?: { currentObjectiveId: string | null; weakConceptIds?: string[] };
  artifacts?: Array<{ id: string; title: string; artifactType: string; status: string; payloadJson?: Record<string, unknown>; sourceNodeRefsJson?: unknown[] }>;
}): AppContext {
  const learningRows: unknown[] = [];
  const objectiveRows: unknown[] = [];
  const objectiveListRows: unknown[] = [];

  const resolveRows = (table: unknown) => {
    if (table === studyPlans) {
      return overrides.studyPlan
        ? [
            {
              id: "plan_1",
              weakConceptIds: overrides.studyPlan.weakConceptIds ?? [],
              currentObjectiveId: overrides.studyPlan.currentObjectiveId,
            },
          ]
        : [];
    }
    if (table === artifacts) return overrides.artifacts ?? [];
    if (table === learningState) return learningRows;
    if (table === objectiveLists) return objectiveListRows;
    if (table === objectives) return objectiveRows;
    return [];
  };

  const chain = (table: unknown) => ({
    where() {
      return chain(table);
    },
    orderBy() {
      return chain(table);
    },
    limit() {
      return Promise.resolve(resolveRows(table));
    },
    then(onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(resolveRows(table)).then(onFulfilled, onRejected);
    },
  });

  return {
    db: {
      db: {
        select() {
          return {
            from(table: unknown) {
              return chain(table);
            },
          };
        },
      },
    },
  } as unknown as AppContext;
}

describe("buildStudyMapReadModel scenarios", () => {
  it("returns an empty learner-visible study map for an empty notebook projection", async () => {
    const result = await buildStudyMapReadModel(makeCtx({}), "nb_empty", "user_1", { nodes: [], edges: [] }, {
      devMode: false,
      projectionWarning: "Study Map is still building. Uploaded sources may still be processing.",
    });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.projectionWarning).toContain("still building");
  });

  it("keeps partially ingested curriculum nodes while hiding draft artifacts", async () => {
    const result = await buildStudyMapReadModel(
      makeCtx({
        artifacts: [{ id: "art_draft", title: "Draft note", artifactType: "note", status: "draft" }],
      }),
      "nb_partial",
      "user_1",
      {
        nodes: [
          { id: "cur_1", nodeType: "curriculum", labels: [], properties: { title: "Course" } },
          { id: "obj_1", nodeType: "objective", labels: [], properties: { title: "Objective 1", status: "not_started" } },
        ],
        edges: [{ id: "e1", source: "cur_1", target: "obj_1", relationType: "CONTAINS", properties: {} }],
      },
      { devMode: false },
    );
    expect(result.nodes.map((node) => node.id)).toEqual(["cur_1"]);
    expect(result.nodeCatalog.find((entry) => entry.node.id === "obj_1")?.visibility).toBe("hidden");
    expect(result.nodeCatalog.find((entry) => entry.node.id === "art_draft")).toBeUndefined();
  });

  it("encodes current objective emphasis for tutoring-ready notebooks", async () => {
    const result = await buildStudyMapReadModel(
      makeCtx({ studyPlan: { currentObjectiveId: "obj_current" } }),
      "nb_ready",
      "user_1",
      {
        nodes: [
          { id: "obj_current", nodeType: "objective", labels: [], properties: { title: "Current objective" } },
          { id: "concept_1", nodeType: "concept", labels: [], properties: { title: "Concept A" } },
        ],
        edges: [{ id: "e1", source: "obj_current", target: "concept_1", relationType: "COVERS", properties: {} }],
      },
      { devMode: false },
    );
    expect(result.emphasis.currentObjectiveId).toBe("obj_current");
    expect(result.emphasis.currentPathConceptIds).toEqual(["concept_1"]);
    expect(result.nodeCatalog.find((entry) => entry.node.id === "obj_current")?.emphasis).toBe("current_objective");
    expect(result.nodeCatalog.find((entry) => entry.node.id === "obj_current")?.visibility).toBe("hidden");
    expect(result.nodes.find((node) => node.id === "obj_current")).toBeUndefined();
  });

  it("exposes dev-only nodes when devMode is enabled", async () => {
    const result = await buildStudyMapReadModel(
      makeCtx({}),
      "nb_dev",
      "user_1",
      {
        nodes: [
          { id: "claim_1", nodeType: "claim", labels: [], properties: {} },
          { id: "concept_1", nodeType: "concept", labels: [], properties: { title: "Concept" } },
        ],
        edges: [],
      },
      { devMode: true },
    );
    expect(result.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["claim_1", "concept_1"]));
    expect(result.nodeCatalog.find((entry) => entry.node.id === "claim_1")?.visibility).toBe("learner");
  });

  it("connects quiz artifacts to nested question concepts and sessions directly after modules", async () => {
    const result = await buildStudyMapReadModel(
      makeCtx({
        artifacts: [
          {
            id: "art_quiz",
            title: "Module quiz",
            artifactType: "quiz",
            status: "ready",
            payloadJson: {
              questions: [
                { id: "q1", prompt: "What is flux?", answer: "Flow per area", conceptIds: ["concept_flux"] },
              ],
            },
            sourceNodeRefsJson: [{ refType: "curriculum_module", refId: "mod_1" }],
          },
        ],
      }),
      "nb_quiz",
      "user_1",
      {
        nodes: [
          { id: "mod_1", nodeType: "curriculum_module", labels: [], properties: { title: "Module 1" } },
          { id: "session_1", nodeType: "session_plan", labels: [], properties: { title: "Session 1", moduleId: "mod_1" } },
          { id: "concept_flux", nodeType: "concept", labels: [], properties: { title: "Heat flux" } },
        ],
        edges: [],
      },
      { devMode: false },
    );

    expect(result.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["mod_1", "session_1", "concept_flux", "art_quiz"]));
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "module-mod_1-session-session_1", source: "mod_1", target: "session_1", relationType: "PLANS" }),
        expect.objectContaining({ id: "artifact-art_quiz-concept_flux", source: "art_quiz", target: "concept_flux", relationType: "TESTS_MASTERY" }),
        expect.objectContaining({ id: "artifact-scope-art_quiz-mod_1", source: "mod_1", target: "art_quiz", relationType: "COVERS" }),
      ]),
    );
  });
});
