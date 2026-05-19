import { describe, expect, it } from "vitest";
import { concepts, studyPlans } from "@studyagent/db";
import {
  ToolRegistry,
  assertToolCatalogMatchesRegistry,
  createNoopRuntimeReadToolProvider,
  createNoopRuntimeWriteToolProvider,
  registerRuntimeToolsV1,
} from "@studyagent/tools";
import { compileSourceToWikiChangeSet } from "@studyagent/wiki-core";
import { buildProjectionPlan } from "@studyagent/graph";
import type { CanonicalProjectionSnapshot } from "@studyagent/graph";
import {
  decideArtifactQuality,
  learnerVisibilityForArtifact,
  resolveArtifactLifecycleOutcome,
} from "./artifact-lifecycle.js";
import { buildReferenceSurface } from "./reference-surface.js";
import { buildStudyMapReadModel } from "./workspace-read-model.js";
import type { AppContext } from "./context.js";

describe("architecture deepening integration", () => {
  it("chains wiki compilation, graph projection, workspace read model, reference surface, artifact lifecycle, and tool contracts", async () => {
    const wikiChangeSet = compileSourceToWikiChangeSet({
      notebookId: "nb_chain",
      sourceId: "src_chain",
      sourceVersionId: "sv_chain",
      sourceTitle: "Calculus Intro",
      chunkIds: ["chk_1"],
      extraction: {
        concepts: [{ name: "Derivative", conceptType: "term" }],
        claims: [
          {
            claimText: "The derivative measures instantaneous rate of change.",
            conceptNames: ["Derivative"],
            evidenceChunkId: "chk_1",
          },
        ],
        relations: [],
        sourceSummaryMarkdown: "## Overview\n\nDerivatives and rates.",
      },
      existingConcepts: [],
      existingClaims: [],
      priorWikiPages: [],
      nextId: (prefix) => `${prefix}_chain`,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    expect(wikiChangeSet.ok).toBe(true);
    if (!wikiChangeSet.ok) throw new Error("expected wiki compilation to succeed");
    const changeSet = wikiChangeSet.changeSet;
    expect(changeSet.concepts.length).toBeGreaterThan(0);
    expect(changeSet.claims.some((claim) => claim.resolution)).toBe(true);

    const conceptId = changeSet.concepts[0]!.id;
    const snapshot: CanonicalProjectionSnapshot = {
      notebookId: "nb_chain",
      scope: "notebook",
      sources: [{ id: "src_chain", title: "Calculus Intro" }],
      concepts: [{ id: conceptId, canonicalName: "Derivative" }],
      claims: changeSet.claims.map((claim) => ({
        id: claim.id,
        sourceId: "src_chain",
        claimText: claim.claimText,
        conceptIds: claim.conceptIds,
      })),
      wikiPages: changeSet.wikiPages.map((page) => ({
        id: page.id,
        pageType: page.pageType,
        pageKey: page.pageKey,
        title: page.title,
        linkedConceptId: page.pageType === "concept" ? conceptId : null,
        sourceId: "src_chain",
      })),
      graphRelations: changeSet.graphRelations,
      curricula: [{ id: "cur_chain", title: "Calculus", sourceIds: ["src_chain"] }],
      modules: [
        {
          id: "mod_chain",
          curriculumId: "cur_chain",
          title: "Derivatives",
          summary: "Core derivative ideas",
          orderIndex: 0,
          status: "active",
        },
      ],
      objectiveLists: [
        {
          id: "olist_chain",
          curriculumId: "cur_chain",
          moduleId: "mod_chain",
          title: "Derivative objectives",
          status: "active",
          objectiveIdsOrdered: ["obj_chain"],
        },
      ],
      objectives: [
        {
          id: "obj_chain",
          curriculumId: "cur_chain",
          title: "Understand the derivative",
          orderIndex: 0,
          status: "in_progress",
        },
      ],
      sessionPlans: [
        {
          id: "sess_chain",
          curriculumId: "cur_chain",
          moduleId: "mod_chain",
          objectiveListId: "olist_chain",
          title: "Derivative session",
          status: "active",
          sessionGoal: "Introduce the derivative",
        },
      ],
      studyPlans: [
        {
          id: "plan_chain",
          title: "Calculus live plan",
          currentObjectiveId: "obj_chain",
          upcomingObjectiveIds: [],
        },
      ],
      coverageItems: [],
      coverageRecords: [],
    };

    const projectionPlan = buildProjectionPlan(snapshot);
    expect(projectionPlan.operations.map((op) => op.kind)).toContain("merge_concepts");

    const studyMap = await buildStudyMapReadModel(
      makeStudyMapCtx({
        studyPlan: { currentObjectiveId: "obj_chain", weakConceptIds: [] },
        artifacts: [
          {
            id: "art_draft",
            title: "Draft derivative note",
            artifactType: "note",
            status: "draft",
            sourceNodeRefsJson: [{ refType: "chunk", refId: "chk_1" }],
          },
        ],
      }),
      "nb_chain",
      "user_chain",
      {
        nodes: [
          {
            id: "obj_chain",
            nodeType: "objective",
            labels: ["Objective"],
            properties: { title: "Understand the derivative", status: "in_progress" },
          },
          { id: conceptId, nodeType: "concept", labels: ["Concept"], properties: { canonicalName: "Derivative" } },
          {
            id: "art_draft",
            nodeType: "artifact",
            labels: ["Artifact"],
            properties: { title: "Draft derivative note", status: "draft", artifactType: "note" },
          },
        ],
        edges: [{ id: "e1", source: "obj_chain", target: conceptId, relationType: "covers", properties: {} }],
      },
      {
        devMode: false,
        projectionWarning: null,
        projectionHealth: {
          scope: "notebook",
          notebookId: "nb_chain",
          status: "healthy",
          lagSeconds: 0,
          lastProjectedAt: null,
          lastFailureAt: null,
          failureReason: null,
          learnerWarning: null,
          developerDetail: null,
        },
      },
    );

    expect(studyMap.emphasis.currentObjectiveId).toBe("obj_chain");
    expect(studyMap.nodes.some((node) => node.id === "art_draft")).toBe(false);
    expect(
      studyMap.nodeCatalog.some((entry) => entry.node.id === conceptId && entry.referenceSurfaceTarget),
    ).toBe(true);

    const lifecycle = resolveArtifactLifecycleOutcome({
      artifactType: "quiz",
      artifactConsent: { autoCreateLearnerArtifacts: false },
      payload: {
        questions: [{ prompt: "What is a derivative?", answer: "Rate of change", conceptIds: [] }],
      },
      sourceRefs: [{ refType: "chunk", refId: "chk_1" }],
    });
    expect(lifecycle.lifecycle.status).toBe("proposed");
    expect(learnerVisibilityForArtifact({ artifactType: "quiz", status: lifecycle.lifecycle.status })).toBe("learner");

    const quality = decideArtifactQuality({
      artifactType: "quiz",
      status: "ready",
      sourceRefs: [{ refType: "chunk", refId: "chk_1" }],
      payload: { questions: [{ prompt: "What is a derivative?", answer: "Rate of change" }] },
    });
    expect(quality.canBecomeReady).toBe(true);

    const surface = await buildReferenceSurface(makeConceptSurfaceCtx(conceptId), "nb_chain", conceptId);
    expect(surface.surfaceType).toBe("concept");
    expect(surface.blocks.length).toBeGreaterThan(0);

    const registry = new ToolRegistry();
    registerRuntimeToolsV1(registry, {
      read: createNoopRuntimeReadToolProvider(),
      write: createNoopRuntimeWriteToolProvider(),
    });
    assertToolCatalogMatchesRegistry(registry);
  });
});

function makeStudyMapCtx(overrides: {
  studyPlan?: { currentObjectiveId: string | null; weakConceptIds?: string[] };
  artifacts?: Array<{
    id: string;
    title: string;
    artifactType: string;
    status: string;
    sourceNodeRefsJson?: unknown[];
  }>;
}): AppContext {
  const chain = (table: unknown) => ({
    where: () => chain(table),
    orderBy: () => chain(table),
    limit: () =>
      Promise.resolve(
        table === studyPlans
          ? overrides.studyPlan
            ? [{ id: "plan_chain", ...overrides.studyPlan }]
            : []
          : overrides.artifacts ?? [],
      ),
    then(onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) {
      return chain(table).limit().then(onFulfilled, onRejected);
    },
  });

  return {
    db: {
      db: {
        select: () => ({
          from: (table: unknown) => chain(table),
        }),
      },
    },
  } as unknown as AppContext;
}

function makeConceptSurfaceCtx(conceptId: string): AppContext {
  const empty = () => ({
    where: () => empty(),
    orderBy: () => empty(),
    limit: () => Promise.resolve([]),
    then(onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve([]).then(onFulfilled, onRejected);
    },
  });

  return {
    db: {
      db: {
        select: () => ({
          from: (table: unknown) => {
            if (table === concepts) {
              return {
                where: () => ({
                  limit: () =>
                    Promise.resolve([
                      {
                        id: conceptId,
                        notebookId: "nb_chain",
                        canonicalName: "Derivative",
                        description: "Measures instantaneous rate of change.",
                      },
                    ]),
                }),
              };
            }
            return empty();
          },
        }),
      },
    },
  } as unknown as AppContext;
}
