import { describe, expect, it } from "vitest";
import { buildConceptPageMarkdown } from "@studyagent/wiki-core";
import { inferSourceLevelFromSignals } from "@studyagent/schemas";
import { buildLearningArtifactView } from "./artifact-view.js";
import { evaluateLearnerResponse } from "./mastery-evaluator.js";
import { computeMasteryDeltaForEvidence } from "./mastery-reducer.js";
import {
  buildAdaptivePlanSignalsFromMasteryEvidence,
  shouldApplyDurablePlanChange,
} from "@studyagent/schemas";
import { buildAdaptiveSessionPlanPatch, decideObjectiveCompletion } from "./phase7.js";
import { buildReferenceSurface } from "./reference-surface.js";
import { ReferenceSurfaceFakeDb, type FakeTableRows } from "./reference-surface.test-db.js";
import type { AppContext } from "./context.js";
import {
  buildTutorContextSelectionPlan,
  buildTutorContextSelectionReason,
  resolveScopedRetrievalRows,
} from "./tutor-tool-provider.js";
import { formatLearnerProgressForDigest } from "./learner-progress.js";
import type { NotebookStudyState } from "./study-state.js";

describe("mastery tutoring end-to-end regression scenarios", () => {
  it("high-level source with beginner learner yields foundational teaching context", () => {
    const sourceLevel = inferSourceLevelFromSignals({
      title: "Graduate Statistical Mechanics",
      metadata: { courseLevel: "graduate" },
      backgroundSummary: "High school algebra only",
    });
    expect(sourceLevel.level).toBe("graduate");

    const state: NotebookStudyState = {
      studentProfile: {
        id: "prof_1",
        goalSummary: "Learn thermodynamics basics",
        backgroundSummary: "High school math",
        pacePreference: "slow",
        depthPreference: "foundational",
        examplePreferencesJson: {},
        assessmentPreferenceJson: {},
        constraintsJson: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      curriculum: null,
      module: null,
      objectiveList: null,
      sessionPlan: null,
      studyPlan: null,
      coverage: { total: 0, planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0, gaps: [] },
      sourceLevels: [{ sourceId: "src_1", level: sourceLevel.level, confidence: sourceLevel.confidence, lastUpdatedReason: sourceLevel.lastUpdatedReason }],
      learnerReadiness: [],
      learnerProgressSummary: { strengths: [], weakConcepts: [], needsReview: [], readyToAdvance: [] },
    };
    const progress = formatLearnerProgressForDigest(state);
    expect(progress === undefined || !/0\.\d{2}/.test(progress)).toBe(true);
  });

  it("strict source scope refuses notebook-wide fallback when selected source has no chunks", () => {
    const rows = [
      { sourceId: "src_other", chunkId: "chunk_1", text: "Other material" },
    ];
    const strict = resolveScopedRetrievalRows(rows, ["src_selected"], "strict_source_scope");
    expect(strict.usedSourceScopeFallback).toBe(false);
    expect(strict.effectiveRows).toHaveLength(0);
    expect(strict.sourceCoverageGap).toBe(true);

    const plan = buildTutorContextSelectionPlan({
      message: "Explain this from my source",
      selectedNodeRefs: [{ refType: "source", refId: "src_selected" }],
      studyState: null,
    });
    const reason = buildTutorContextSelectionReason({
      plan,
      maxChunks: 6,
      selectedChunkCount: 0,
      usedSourceScopeFallback: strict.usedSourceScopeFallback,
      sourceIds: plan.selectedSourceIds,
      sourceCoverageGap: strict.sourceCoverageGap,
      sourceScopePolicy: "strict_source_scope",
    });
    expect(reason).toContain("strict_source_scope");
    expect(reason).toContain("source coverage gap");
  });

  it("partial learner answer recommends guided practice and small mastery delta", async () => {
    const evidence = await evaluateLearnerResponse({
      notebookId: "nb_1",
      userId: "user_1",
      tutorQuestion: "What is the derivative of x^2?",
      learnerAnswer: "the slope is x",
      referenceAnswer: "2x",
      conceptRoles: [{ conceptId: "c_deriv", role: "primary" }],
      masterySnapshot: { c_deriv: 0.4 },
      sourceRefs: [],
      contextRefs: [],
    });
    expect(["guided_practice", "reteach", "clarify"]).toContain(evidence.tutoringIntervention);
    const delta = computeMasteryDeltaForEvidence(evidence, "c_deriv");
    expect(Math.abs(delta)).toBeLessThan(0.15);
  });

  it("repeated mistake creates remediation-oriented adaptive plan signals", () => {
    const signals = buildAdaptivePlanSignalsFromMasteryEvidence({
      id: "mev_mistake",
      notebookId: "nb_1",
      userId: "user_1",
      correctnessLabel: "incorrect",
      overallScore: 0.2,
      conceptScores: [{ conceptId: "c_chain", score: 0.18, delta: -0.1, role: "primary" }],
      misconceptions: [{ conceptId: "c_chain", description: "Applied product rule instead of chain rule" }],
      readiness: "developing",
      tutoringIntervention: "guided_practice",
      uncertainty: 0.2,
      confidence: 0.84,
      evidenceType: "repeated_mistake",
      triggerSource: "runtime_auto",
      sourceRefs: [],
      contextRefs: [],
      evaluatorProvenance: { mode: "deterministic", model: null, fallbackUsed: false, notes: "test" },
    });
    expect(shouldApplyDurablePlanChange(signals)).toBe(true);
    const patch = buildAdaptiveSessionPlanPatch({
      currentPlannedObjectiveIds: ["obj_intro", "obj_remediate"],
      currentSessionGoal: "Generic",
      objectiveIdsOrdered: ["obj_intro", "obj_remediate"],
      currentObjectiveId: null,
      objectives: [
        { id: "obj_intro", title: "Intro", status: "in_progress", targetConceptIds: ["c_other"] },
        { id: "obj_remediate", title: "Chain rule repair", status: "not_started", targetConceptIds: ["c_chain"] },
      ],
      weakConceptIds: ["c_chain"],
      misconceptionConceptIds: ["c_chain"],
      adaptivePlanSignals: signals,
    });
    expect(patch?.plannedObjectiveIds).toContain("obj_remediate");
    expect(patch?.sessionGoal).toContain("weak concepts");
  });

  it("strong answer advances objective after mastery threshold", async () => {
    const evidence = await evaluateLearnerResponse({
      notebookId: "nb_1",
      userId: "user_1",
      tutorQuestion: "What is 2+2?",
      learnerAnswer: "4",
      referenceAnswer: "4",
      conceptRoles: [
        { conceptId: "c_a", role: "primary" },
        { conceptId: "c_b", role: "primary" },
      ],
      masterySnapshot: { c_a: 0.7, c_b: 0.72 },
      sourceRefs: [],
      contextRefs: [],
    });
    expect(evidence.correctnessLabel).toBe("correct");
    const decision = decideObjectiveCompletion({
      objectiveTitle: "Arithmetic fluency",
      targetConceptIds: ["c_a", "c_b"],
      conceptMasteryById: { c_a: 0.8, c_b: 0.76 },
    });
    expect(decision.shouldComplete).toBe(true);
  });

  it("personalized note renders source-grounded and learner-specific sections", () => {
    const view = buildLearningArtifactView({
      id: "artifact_note_1",
      notebookId: "nb_1",
      artifactType: "note",
      title: "Session notes",
      status: "ready",
      payloadJson: {
        markdown: "## Key ideas\n- Use the chain rule carefully.",
        personalization: {
          whyPersonalized: "Targets your recent mistakes",
          sections: [
            { id: "s1", title: "From your source", kind: "from_source", body: "The source defines the chain rule as...", sourceRefs: [{ refType: "source", refId: "src_1" }] },
            { id: "s2", title: "For your mistakes", kind: "for_mistakes", body: "You swapped inner and outer derivatives last session.", sourceRefs: [] },
          ],
        },
      },
    });
    expect(view.sections.some((section) => section.title === "From your source")).toBe(true);
    expect(view.sections.some((section) => section.title === "For your mistakes")).toBe(true);
    expect(view.sections.some((section) => typeof section.content === "string" && section.content.includes("chain rule"))).toBe(true);
  });

  it("source wiki concept page is learner-readable without claim ids", async () => {
    const markdown = buildConceptPageMarkdown("Conduction", [
      { id: "claim_1", text: "Conduction transfers heat through direct contact.", confidence: 0.9 },
    ]);
    expect(markdown).not.toMatch(/claim_/);
    expect(markdown.toLowerCase()).toContain("conduction");

    const fixture: FakeTableRows = {
      concepts: [
        {
          id: "concept_1",
          notebookId: "nb_1",
          canonicalName: "Conduction",
          description: "Heat transfer through matter.",
          conceptType: "physics",
          confidence: 0.9,
        },
      ],
      claims: [
        {
          id: "claim_hidden",
          claimType: "definition",
          claimText: "Conduction transfers heat by contact.",
          confidence: 0.9,
          status: "accepted",
          sourceChunkIds: ["chunk_1"],
        },
      ],
      claimConceptLinks: [{ claimId: "claim_hidden" }],
      chunks: [{ id: "chunk_1", sourceId: "src_1", text: "Heat moves through solids." }],
    };
    const ctx = { db: { db: new ReferenceSurfaceFakeDb(fixture, "concept_1") }, env: {} } as unknown as AppContext;
    const surface = await buildReferenceSurface(ctx, "nb_1", "concept_1");
    const body = surface.blocks.map((block) => block.content).join("\n");
    expect(body).not.toMatch(/claim_hidden/);
    expect(`${surface.title} ${body}`.toLowerCase()).toContain("conduction");
  });
});
