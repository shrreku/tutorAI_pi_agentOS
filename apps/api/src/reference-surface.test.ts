import { describe, expect, it } from "vitest";
import type { AppContext } from "./context.js";
import { buildNodeEvidence, buildReferenceSurface } from "./reference-surface.js";
import { ReferenceSurfaceFakeDb, type FakeTableRows } from "./reference-surface.test-db.js";

const NB = "nb_1";
const now = new Date("2026-05-15T00:00:00.000Z");

function ctxFor(rows: FakeTableRows, nodeId?: string): AppContext {
  return { db: { db: new ReferenceSurfaceFakeDb(rows, nodeId) }, env: {} } as unknown as AppContext;
}

const conceptFixture: FakeTableRows = {
  concepts: [
    {
      id: "concept_1",
      notebookId: NB,
      canonicalName: "Conduction",
      description: "Heat transfer through matter.",
      conceptType: "physics",
      confidence: 0.91,
    },
  ],
  claims: [
    {
      id: "claim_1",
      claimType: "definition",
      claimText: "Conduction transfers heat by direct contact.",
      confidence: 0.9,
      status: "accepted",
      sourceChunkIds: ["chunk_1"],
    },
    {
      id: "claim_2",
      claimType: "note",
      claimText: "This claim still needs review.",
      confidence: 0.2,
      status: "candidate",
      sourceChunkIds: ["chunk_1"],
    },
    {
      id: "claim_3",
      claimType: "note",
      claimText: "Inferred from partial source support.",
      confidence: 0.55,
      status: "candidate",
      sourceChunkIds: ["chunk_1"],
    },
    {
      id: "claim_4",
      claimType: "note",
      claimText: "Generated without source support.",
      confidence: 0.7,
      status: "accepted",
      sourceChunkIds: [],
    },
  ],
  claimConceptLinks: [{ claimId: "claim_1" }, { claimId: "claim_2" }, { claimId: "claim_3" }, { claimId: "claim_4" }],
  chunks: [
    {
      id: "chunk_1",
      chunkType: "paragraph",
      text: "Conduction transfers heat by direct contact.",
      pageStart: 1,
      pageEnd: 1,
      sourceVersionId: "sv_1",
    },
  ],
  sourceVersions: [{ id: "sv_1", sourceId: "src_1" }],
  sources: [{ id: "src_1", notebookId: NB, title: "Source One", sourceType: "pdf", status: "tutoring_ready" }],
};

function artifactRow(
  id: string,
  artifactType: string,
  payloadJson: Record<string, unknown>,
  extra: Partial<Record<string, unknown>> = {},
) {
  return {
    id,
    notebookId: NB,
    artifactType,
    title: `${artifactType} title`,
    status: "ready",
    payloadJson,
    sourceNodeRefsJson: [],
    sourceClaimIds: ["claim_1"],
    sourceChunkIds: ["chunk_1"],
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

describe("reference surface module", () => {
  it("builds a concept surface with attached evidence refs", async () => {
    const surface = await buildReferenceSurface(ctxFor(conceptFixture, "concept_1"), NB, "concept_1");
    expect(surface.surfaceType).toBe("concept");
    const sourceBackedNotes = surface.blocks.find((block) => block.id === "source_claims");
    expect(sourceBackedNotes?.content).toEqual([
      { title: "Source note", body: "Conduction transfers heat by direct contact." },
    ]);
    expect(JSON.stringify(surface.blocks)).not.toContain("claim_1");
    expect(JSON.stringify(surface.blocks)).not.toContain("accepted");
    expect(JSON.stringify(surface.blocks)).not.toContain("0.9");
    expect(surface.blocks[0]?.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "chunk", visibility: "learner" }),
        expect.objectContaining({ kind: "claim", visibility: "learner", confidence: null, status: null }),
      ]),
    );
    expect(surface.quality.confidence).toBeNull();
  });

  it("excludes candidate and low-confidence claims from concept blocks", async () => {
    const surface = await buildReferenceSurface(ctxFor(conceptFixture, "concept_1"), NB, "concept_1");
    const bodies = JSON.stringify(surface.blocks);
    expect(bodies).not.toContain("still needs review");
    expect(bodies).not.toContain("Generated without source support");
    expect(surface.quality.needsReview).toBe(true);
  });

  it("still builds a concept surface when no accepted claims exist", async () => {
    const surface = await buildReferenceSurface(
      ctxFor(
        {
          concepts: conceptFixture.concepts ?? [],
          claims: [
            {
              id: "claim_2",
              claimType: "note",
              claimText: "Candidate only.",
              confidence: 0.2,
              status: "candidate",
              sourceChunkIds: ["chunk_1"],
            },
          ],
          claimConceptLinks: [{ claimId: "claim_2" }],
          chunks: conceptFixture.chunks ?? [],
          sourceVersions: conceptFixture.sourceVersions ?? [],
          sources: conceptFixture.sources ?? [],
        },
        "concept_1",
      ),
      NB,
      "concept_1",
    );
    expect(surface.blocks.some((block) => block.id === "overview")).toBe(true);
    expect(surface.blocks.find((block) => block.id === "source_claims")?.content).toEqual([]);
  });

  it("builds a wiki page surface", async () => {
    const surface = await buildReferenceSurface(
      ctxFor(
        {
        wikiPages: [
          {
            id: "wiki_1",
            notebookId: NB,
            title: "Conduction page",
            pageType: "concept",
            status: "published",
            markdown: "# Conduction\nHeat moves through contact.",
            sourceClaimIds: [],
            sourceChunkIds: [],
            qualityScore: 0.8,
          },
        ],
      },
        "wiki_1",
      ),
      NB,
      "wiki_1",
    );
    expect(surface.surfaceType).toBe("wiki_page");
    expect(surface.blocks[0]?.kind).toBe("markdown");
  });

  it("builds a curriculum surface", async () => {
    const surface = await buildReferenceSurface(
      ctxFor(
        {
        curricula: [
          {
            id: "curr_1",
            notebookId: NB,
            title: "Thermodynamics",
            status: "active",
            scopeJson: { summary: "Heat and energy." },
            coverageSummaryJson: { modules: 2 },
            sourceIds: ["src_1"],
            confidence: 0.7,
          },
        ],
        curriculumModules: [
          {
            id: "mod_1",
            notebookId: NB,
            curriculumId: "curr_1",
            title: "Heat transfer basics",
            status: "active",
            summary: "Introduce conduction and convection.",
            orderIndex: 0,
          },
        ],
      },
        "curr_1",
      ),
      NB,
      "curr_1",
    );
    expect(surface.surfaceType).toBe("curriculum");
    expect(surface.blocks.map((block) => block.id)).toEqual(expect.arrayContaining(["overview", "modules"]));
    expect(JSON.stringify(surface.blocks)).not.toContain("coverageSummaryJson");
  });

  it("builds a module surface", async () => {
    const surface = await buildReferenceSurface(
      ctxFor(
        {
        curriculumModules: [
          {
            id: "mod_1",
            notebookId: NB,
            curriculumId: "curr_1",
            title: "Heat transfer basics",
            status: "active",
            summary: "Introduce conduction and convection.",
            sourceRefsJson: [{ refType: "source", refId: "src_1" }],
            coverageRequirementsJson: {},
            masteryGateJson: {},
          },
        ],
        objectiveLists: [
          {
            id: "mod_1",
            notebookId: NB,
            curriculumId: "curr_1",
            moduleId: "mod_1",
            title: "Heat transfer objectives",
            status: "active",
            currentObjectiveId: "obj_1",
            objectiveIdsOrdered: ["obj_1"],
          },
        ],
        objectives: [
          {
            id: "obj_1",
            notebookId: NB,
            curriculumId: "curr_1",
            title: "Explain conduction",
            status: "active",
            successCriteriaJson: { canExplain: "Explain conduction in your own words." },
          },
        ],
      },
        "mod_1",
      ),
      NB,
      "mod_1",
    );
    expect(surface.surfaceType).toBe("module");
    expect(surface.scopeRefs[0]?.refType).toBe("curriculum");
    expect(surface.blocks.map((block) => block.id)).toEqual(expect.arrayContaining(["overview", "objectives"]));
    expect(JSON.stringify(surface.blocks)).toContain("Explain conduction");
  });

  it("builds an objective surface", async () => {
    const surface = await buildReferenceSurface(
      ctxFor(
        {
        objectives: [
          {
            id: "obj_1",
            notebookId: NB,
            curriculumId: "curr_1",
            title: "Explain conduction",
            status: "active",
            prerequisiteConceptIds: ["concept_1"],
            targetConceptIds: [],
            successCriteriaJson: { mastery: 0.7 },
            sourceRefsJson: [],
            readinessScore: 0.6,
          },
        ],
        artifacts: [],
      },
        "obj_1",
      ),
      NB,
      "obj_1",
    );
    expect(surface.surfaceType).toBe("objective");
    expect(surface.blocks.some((block) => block.id === "concepts")).toBe(true);
  });

  it("builds a session surface", async () => {
    const surface = await buildReferenceSurface(
      ctxFor(
        {
        sessionPlans: [
          {
            id: "sess_1",
            notebookId: NB,
            curriculumId: "curr_1",
            moduleId: "mod_1",
            title: "Session 1",
            status: "active",
            sessionGoal: "Practice conduction problems.",
            plannedObjectiveIds: ["obj_1"],
            openerJson: {},
            exitCriteriaJson: {},
          },
        ],
        objectives: [
          {
            id: "obj_1",
            title: "Explain conduction",
            status: "active",
            successCriteriaJson: {},
          },
        ],
      },
        "sess_1",
      ),
      NB,
      "sess_1",
    );
    expect(surface.surfaceType).toBe("session");
    expect(surface.blocks.some((block) => block.id === "session_objectives")).toBe(true);
  });

  it("builds a tutor session surface with insights", async () => {
    const surface = await buildReferenceSurface(
      ctxFor(
        {
          tutorSessions: [
            {
              id: "sess_live",
              notebookId: NB,
              userId: "user_1",
              mode: "learn",
              status: "active",
              selectedNodeRefsJson: [{ refType: "source", refId: "src_1" }],
              runtimeContextJson: { currentSessionGoal: "Review conduction with evidence." },
              startedAt: now,
              endedAt: null,
            },
          ],
          tutorTurns: [
            {
              id: "turn_1",
              sessionId: "sess_live",
              turnIndex: 0,
              userMessage: "I'm confused about conduction.",
              assistantMessage: "Conduction moves heat by direct contact.",
              selectedNodeRefsJson: [],
              toolSummaryJson: {},
              citationRefsJson: [],
              createdAt: now,
            },
            {
              id: "turn_2",
              sessionId: "sess_live",
              turnIndex: 1,
              userMessage: "What is the formula?",
              assistantMessage: "Next, review Fourier's law.",
              selectedNodeRefsJson: [],
              toolSummaryJson: {},
              citationRefsJson: [],
              createdAt: now,
            },
          ],
          sources: [{ id: "src_1", notebookId: NB, title: "Textbook", sourceType: "pdf", status: "tutoring_ready" }],
        },
        "sess_live",
      ),
      NB,
      "sess_live",
    );
    expect(surface.surfaceType).toBe("session");
    expect(surface.blocks.some((block) => block.id === "session_overview")).toBe(true);
    expect(JSON.stringify(surface.blocks)).toContain("Conduction moves heat by direct contact.");
    expect(JSON.stringify(surface.blocks)).toContain("What is the formula?");
    expect(surface.sourceRefs).toEqual([{ refType: "source", refId: "src_1" }]);
  });

  it("builds a source surface", async () => {
    const surface = await buildReferenceSurface(
      ctxFor(
        {
        sources: [{ id: "src_1", notebookId: NB, title: "Textbook", sourceType: "pdf", status: "tutoring_ready" }],
      },
        "src_1",
      ),
      NB,
      "src_1",
    );
    expect(surface.surfaceType).toBe("source");
    expect(surface.quality.sourceBacked).toBe(true);
    expect(surface.primaryActions).toContain("open_source");
  });

  it("returns a typed fallback surface for unknown nodes", async () => {
    const surface = await buildReferenceSurface(ctxFor({}, "missing_node"), NB, "missing_node");
    expect(surface.surfaceType).toBe("fallback");
    expect(surface.nodeRef.refType).toBe("whiteboard_node");
    expect(surface.quality.needsReview).toBe(true);
  });

  describe("artifact payload to reference surface blocks", () => {
    it.each([
      ["note", { markdown: "Study note body." }, "markdown"],
      ["quiz", { questions: [{ prompt: "Q1?", answer: "A1" }] }, "question_list"],
      ["flashcards", { cards: [{ front: "Term", back: "Definition" }] }, "flashcard_list"],
      ["worked_example", { problemStatement: "Solve for x.", solutionSteps: ["Step 1"] }, "step_list"],
      ["formula_sheet", { formulas: [{ name: "Fourier", expression: "q = -k dT/dx" }] }, "formula_table"],
      ["comparison_page", { comparisonRows: [{ left: "A", right: "B" }] }, "comparison_table"],
      ["concept_card", { definition: "A concept card definition." }, "markdown"],
    ] as const)("converts %s artifacts", async (artifactType, payloadJson, expectedKind) => {
      const artifactId = `art_${artifactType}`;
      const surface = await buildReferenceSurface(
        ctxFor({ artifacts: [artifactRow(artifactId, artifactType, payloadJson)] }, artifactId),
        NB,
        artifactId,
      );
      expect(surface.surfaceType).toBe("artifact");
      expect(surface.blocks.some((block) => block.kind === expectedKind)).toBe(true);
      expect(surface.status).toBe("Ready to study");
      expect(surface.primaryActions).toEqual(
        artifactType === "quiz" ? ["ask_tutor", "quiz", "open_provenance"] : ["ask_tutor", "review", "open_provenance"],
      );
    });

    it("hides internal lifecycle status labels on draft artifacts", async () => {
      const surface = await buildReferenceSurface(
        ctxFor({ artifacts: [artifactRow("art_draft", "note", { markdown: "Draft note." }, { status: "draft" })] }, "art_draft"),
        NB,
        "art_draft",
      );
      expect(surface.status).toBeNull();
    });
  });
});

describe("buildNodeEvidence", () => {
  it("returns source-backed and low-confidence developer evidence for concepts", async () => {
    const evidence = await buildNodeEvidence(ctxFor(conceptFixture, "concept_1"), NB, "concept_1", { devMode: true });
    expect(evidence.learnerRefs.some((ref) => ref.kind === "chunk")).toBe(true);
    expect(evidence.learnerRefs.some((ref) => ref.statementKind === "source_backed")).toBe(true);
    expect(evidence.developerRefs.some((ref) => ref.visibility === "developer")).toBe(true);
    expect(evidence.developerRefs.some((ref) => (ref.confidence ?? 1) < 0.45)).toBe(true);
  });

  it("classifies inferred evidence when chunks exist but confidence is below learner threshold", async () => {
    const evidence = await buildNodeEvidence(ctxFor(conceptFixture, "concept_1"), NB, "concept_1", { devMode: true });
    expect(evidence.developerRefs.some((ref) => ref.statementKind === "inferred")).toBe(true);
  });

  it("keeps generated evidence without source chunks in Dev Mode", async () => {
    const evidence = await buildNodeEvidence(ctxFor(conceptFixture, "concept_1"), NB, "concept_1", { devMode: true });
    const generated = evidence.developerRefs.find((ref) => ref.id === "claim_4");
    expect(generated?.statementKind).toBe("generated");
    expect(evidence.learnerRefs.some((ref) => ref.id === "claim_4")).toBe(false);
  });

  it("returns developer evidence only when Dev Mode is enabled", async () => {
    const learnerEvidence = await buildNodeEvidence(ctxFor(conceptFixture, "concept_1"), NB, "concept_1");
    const developerEvidence = await buildNodeEvidence(ctxFor(conceptFixture, "concept_1"), NB, "concept_1", { devMode: true });

    expect(learnerEvidence.developerRefs).toEqual([]);
    expect(learnerEvidence.learnerRefs.every((ref) => ref.kind !== "claim" || (ref.confidence === null && ref.status === null))).toBe(true);
    expect(developerEvidence.developerRefs.some((ref) => ref.visibility === "developer")).toBe(true);
    expect(developerEvidence.learnerRefs.some((ref) => ref.kind === "claim" && ref.confidence !== null)).toBe(true);
  });

  it("returns empty evidence for unknown nodes", async () => {
    const evidence = await buildNodeEvidence(ctxFor({}, "missing_node"), NB, "missing_node");
    expect(evidence.entityType).toBeNull();
    expect(evidence.learnerRefs).toEqual([]);
    expect(evidence.developerRefs).toEqual([]);
  });

  it("returns evidence for artifacts with linked chunks", async () => {
    const evidence = await buildNodeEvidence(
      ctxFor(
        {
          artifacts: [artifactRow("art_1", "note", { markdown: "Body" })],
          claims: conceptFixture.claims ?? [],
          chunks: conceptFixture.chunks ?? [],
          sourceVersions: conceptFixture.sourceVersions ?? [],
          sources: conceptFixture.sources ?? [],
        },
        "art_1",
      ),
      NB,
      "art_1",
    );
    expect(evidence.entityType).toBe("artifact");
    expect(evidence.learnerRefs.some((ref) => ref.kind === "chunk")).toBe(true);
  });

  it("returns empty evidence for sources without linked claims", async () => {
    const evidence = await buildNodeEvidence(
      ctxFor(
        {
        sources: [{ id: "src_1", notebookId: NB, title: "Textbook", sourceType: "pdf", status: "tutoring_ready" }],
      },
        "src_1",
      ),
      NB,
      "src_1",
    );
    expect(evidence.entityType).toBe("source");
    expect(evidence.learnerRefs).toEqual([]);
  });
});
