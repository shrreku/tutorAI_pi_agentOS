import { describe, expect, it } from "vitest";
import { wikiPages } from "@studyagent/db";
import { learnerFacingSurfaceStatus, pageReadinessLabel, resolveWorkspaceRefreshPolicy } from "@studyagent/schemas";
import { buildReferenceSurface } from "./reference-surface.js";
import { ReferenceSurfaceFakeDb } from "./reference-surface.test-db.js";
import { augmentCanvasWithPageReadiness } from "./workspace-read-model.js";
import type { AppContext } from "./context.js";
import {
  assertNoAutoFlashcardArtifacts,
  pageReadinessForPage,
  simulateConceptTouch,
  simulateInitialBuild,
  simulatePostIngestBaseline,
} from "./rolling-wiki-lifecycle.simulator.js";

// Contract simulation for workspace projection and learner-safety policies.
// Postgres-backed orchestration lives in packages/wiki-generation rolling-generation.postgres.integration.test.ts.
describe("rolling wiki generation integration", () => {
  it("creates one curriculum outline, heuristic pages, and module 1 objectives only", () => {
    const state = simulatePostIngestBaseline({
      notebookId: "nb_roll",
      sourceId: "src_roll",
      sourceVersionId: "sv_roll",
      sourceTitle: "Heat Transfer Notes",
      chunkIds: ["chk_1", "chk_2", "chk_3"],
      concepts: [{ name: "Conduction" }, { name: "Fourier law" }],
      claims: [
        {
          claimText: "Conduction transfers heat through solids.",
          conceptNames: ["Conduction"],
          evidenceChunkId: "chk_1",
        },
        {
          claimText: "Fourier law relates heat flux to temperature gradient.",
          conceptNames: ["Fourier law"],
          evidenceChunkId: "chk_2",
        },
      ],
      modulePlans: [
        {
          title: "Module 1 · Conduction basics",
          summary: "Build intuition for conduction.",
          objectiveTitles: ["Explain conduction", "Apply Fourier law"],
        },
        {
          title: "Module 2 · Advanced transfer",
          summary: "Outline only for later build.",
          objectiveTitles: ["Compare convection and radiation"],
        },
      ],
      llmAvailable: true,
    });

    expect(state.curriculumId).toBe("cur_rolling");
    expect(state.modules).toHaveLength(2);
    expect(state.modules[0]?.objectiveIds).toHaveLength(2);
    expect(state.modules[1]?.objectiveIds).toHaveLength(0);
    expect(state.modules[1]?.deepBuilt).toBe(false);
    expect(state.pages.some((page) => page.structuredJson.generationMode === "heuristic")).toBe(true);
    assertNoAutoFlashcardArtifacts(state);
  });

  it("polishes module 1 topics after initial build with a mocked LLM", () => {
    const baseline = simulatePostIngestBaseline({
      notebookId: "nb_roll",
      sourceId: "src_roll",
      sourceVersionId: "sv_roll",
      sourceTitle: "Heat Transfer Notes",
      chunkIds: ["chk_1"],
      concepts: [{ name: "Conduction" }],
      claims: [{ claimText: "Conduction transfers heat.", conceptNames: ["Conduction"], evidenceChunkId: "chk_1" }],
      modulePlans: [
        { title: "Module 1", summary: "First module", objectiveTitles: ["Explain conduction"] },
        { title: "Module 2", summary: "Later module", objectiveTitles: ["Outline only"] },
      ],
      llmAvailable: true,
    });

    const polished = simulateInitialBuild(baseline, (page) => {
      if (page.pageType !== "concept" && !page.pageKey.startsWith("module:")) return null;
      return {
        markdown: `${page.markdown}\n\nPolished module 1 notes.`,
        qualityScore: 0.82,
        readiness: "ready_to_study",
      };
    });

    const modulePage = polished.pages.find((page) => page.pageKey === "module:mod_1");
    expect(modulePage?.structuredJson.generationMode).toBe("llm_polished");
    expect(pageReadinessForPage(modulePage!)).toBe("ready_to_study");
    expect(polished.events).toContain("generation.initial_build.completed");
  });

  it("improves a concept page on touch and continues with heuristic when polish times out", async () => {
    const baseline = simulatePostIngestBaseline({
      notebookId: "nb_roll",
      sourceId: "src_roll",
      sourceVersionId: "sv_roll",
      sourceTitle: "Heat Transfer Notes",
      chunkIds: ["chk_1"],
      concepts: [{ name: "Conduction" }],
      claims: [{ claimText: "Conduction transfers heat.", conceptNames: ["Conduction"], evidenceChunkId: "chk_1" }],
      modulePlans: [{ title: "Module 1", summary: "First module", objectiveTitles: ["Explain conduction"] }],
      llmAvailable: true,
    });

    const conceptId = baseline.pages.find((page) => page.pageType === "concept")?.structuredJson.conceptId;
    expect(typeof conceptId).toBe("string");

    const improved = await simulateConceptTouch({
      state: baseline,
      conceptId: conceptId as string,
      foregroundBudgetMs: 50,
      polish: async () => ({
        markdown: "## Conduction\n\nPolished concept page.",
        qualityScore: 0.88,
        readiness: "ready_to_study",
      }),
    });
    expect(improved.foregroundTimedOut).toBe(false);
    expect(improved.pageReadiness).toBe("ready_to_study");
    expect(improved.state.events).toContain("generation.touch.completed");

    const timedOut = await simulateConceptTouch({
      state: baseline,
      conceptId: conceptId as string,
      foregroundBudgetMs: 5,
      polish: async () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                markdown: "## Conduction\n\nLate polish.",
                qualityScore: 0.9,
                readiness: "ready_to_study",
              }),
            40,
          );
        }),
    });
    expect(timedOut.foregroundTimedOut).toBe(true);
    expect(timedOut.pageReadiness).toBe("still_improving");
    expect(timedOut.state.events).toContain("generation.touch.foreground_timeout");
  });

  it("falls back to heuristic baseline when LLM is unavailable", () => {
    const state = simulatePostIngestBaseline({
      notebookId: "nb_roll",
      sourceId: "src_roll",
      sourceVersionId: "sv_roll",
      sourceTitle: "Sparse Source",
      chunkIds: ["chk_1"],
      concepts: [{ name: "Topic A" }],
      claims: [{ claimText: "Topic A appears in the source.", conceptNames: ["Topic A"], evidenceChunkId: "chk_1" }],
      modulePlans: [{ title: "Module 1", summary: "Fallback module", objectiveTitles: ["Learn Topic A"] }],
      llmAvailable: false,
    });

    expect(state.events).toContain("generation.initial_build.failed");
    expect(state.pages.every((page) => page.structuredJson.generationMode === "heuristic")).toBe(true);
    assertNoAutoFlashcardArtifacts(state);
  });

  it("projects page readiness into workspace nodes and reference surfaces", async () => {
    const conceptId = "cnc_roll";
    const wikiPage = {
      id: conceptId,
      notebookId: "nb_roll",
      pageKey: `concept:${conceptId}`,
      pageType: "concept",
      title: "Conduction",
      markdown: "## Conduction\n\nPolished notes.",
      status: "published",
      qualityScore: 0.86,
      sourceClaimIds: ["claim_1", "claim_2"],
      sourceChunkIds: ["chunk_1"],
      structuredJson: {
        conceptId,
        generationMode: "llm_polished",
        pageReadiness: "ready_to_study",
        lastPolishedAt: "2026-06-09T12:00:00.000Z",
      },
      provenanceJson: [],
      version: 1,
      createdAt: new Date("2026-06-09T12:00:00.000Z"),
      updatedAt: new Date("2026-06-09T12:00:00.000Z"),
    };

    const graphCtx = makeWikiPagesCtx([wikiPage]);
    const nodes = await augmentCanvasWithPageReadiness(graphCtx, "nb_roll", [
      {
        id: conceptId,
        nodeType: "concept",
        labels: ["Concept"],
        properties: { canonicalName: "Conduction", status: "weak", masteryScore: 0.3 },
      },
    ]);

    expect(nodes[0]?.properties.pageReadiness).toBe("ready_to_study");
    expect(nodes[0]?.properties.pageReadinessLabel).toBe("Ready to study");
    expect(nodes[0]?.properties.status).toBe("weak");

    const surfaceCtx = {
      db: { db: new ReferenceSurfaceFakeDb({
        concepts: [
          {
            id: conceptId,
            notebookId: "nb_roll",
            canonicalName: "Conduction",
            description: "Heat transfer mode.",
            conceptType: "physics",
            confidence: 0.9,
          },
        ],
        wikiPages: [wikiPage],
        claims: [
          {
            id: "claim_1",
            claimType: "definition",
            claimText: "Conduction transfers heat through solids.",
            confidence: 0.9,
            status: "accepted",
            sourceChunkIds: ["chunk_1"],
          },
        ],
        claimConceptLinks: [{ claimId: "claim_1" }],
        chunks: [
          {
            id: "chunk_1",
            chunkType: "paragraph",
            text: "Conduction transfers heat through solids.",
            pageStart: 1,
            pageEnd: 1,
            sourceVersionId: "sv_roll",
          },
        ],
        sourceVersions: [{ id: "sv_roll", sourceId: "src_roll" }],
        sources: [{ id: "src_roll", notebookId: "nb_roll", title: "Heat notes", sourceType: "pdf", status: "tutoring_ready" }],
      }, conceptId) },
      env: {},
    } as unknown as AppContext;

    const surface = await buildReferenceSurface(surfaceCtx, "nb_roll", conceptId);
    expect(surface.status).toBe("ready_to_study");
    expect(learnerFacingSurfaceStatus({ surfaceType: "concept", status: surface.status })).toBe("Ready to study");
    expect(surface.generation).toBeUndefined();
    expect(pageReadinessLabel("ready_to_study")).toBe("Ready to study");
  });

  it("invalidates workspace refresh targets for generation and readiness events", () => {
    expect(resolveWorkspaceRefreshPolicy("wiki.page.readiness_changed").targets).toEqual(
      expect.arrayContaining(["graph", "referenceSurfaces", "curriculum"]),
    );
    expect(resolveWorkspaceRefreshPolicy("generation.page.readiness_changed").targets).toEqual(
      expect.arrayContaining(["graph", "referenceSurfaces", "curriculum"]),
    );
    expect(resolveWorkspaceRefreshPolicy("generation.touch.foreground_timeout").targets).toEqual(
      expect.arrayContaining(["graph", "referenceSurfaces"]),
    );
  });
});

function makeWikiPagesCtx(wikiPageRows: unknown[]): AppContext {
  return {
    db: {
      db: {
        select: () => ({
          from: (table: unknown) => {
            if (table === wikiPages) {
              return {
                where: () => Promise.resolve(wikiPageRows),
              };
            }
            return {
              where: () => ({
                orderBy: () => ({
                  limit: () => Promise.resolve([]),
                }),
                limit: () => Promise.resolve([]),
                then(onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) {
                  return Promise.resolve([]).then(onFulfilled, onRejected);
                },
              }),
            };
          },
        }),
      },
    },
  } as unknown as AppContext;
}
