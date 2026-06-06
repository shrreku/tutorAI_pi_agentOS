import { describe, expect, it } from "vitest";
import type { SyntheticLearnerForbiddenProductStateSnapshot } from "./synthetic-learner-evals-persistence-types.js";
import {
  buildEvalEvidenceSnapshot,
  buildTraitRecommendationOnlySnapshot,
  evalEvidenceSnapshotToPersistenceEvidence,
  extractForbiddenProductStateFromSnapshot,
  missingRequiredSnapshotCategories,
} from "./synthetic-learner-evals.snapshot.js";

function forbiddenSnapshot(
  overrides: Partial<SyntheticLearnerForbiddenProductStateSnapshot> = {},
): SyntheticLearnerForbiddenProductStateSnapshot {
  return {
    masteryEvidenceRefs: [],
    learningStateRefs: [],
    weakConceptRefs: [],
    objectiveRefs: [],
    curriculumRefs: [],
    studyPlanRefs: [],
    artifactRefs: [],
    sourceGroundingRefs: [],
    explicitLearnerGoalRefs: [],
    readinessRefs: [],
    traitSignalRefs: [],
    traitEstimateRefs: [],
    personalizationRecommendationRefs: [],
    ...overrides,
  };
}

describe("eval evidence snapshot adapter", () => {
  it("captures explicit categories with availability metadata and snapshot refs", () => {
    const snapshot = buildEvalEvidenceSnapshot({
      id: "snap_eval_001",
      notebookId: "nb_eval_001",
      capturedAt: "2026-05-22T00:01:00.000Z",
      masteryEvidence: [{ ref: { refType: "turn", refId: "turn_001" }, overallScore: 0.8, confidence: 0.9 }],
      artifacts: [{ ref: { refType: "artifact", refId: "artifact_quiz_1" }, status: "ready" }],
      sessionEvents: [{ ref: { refType: "session", refId: "sess_001" }, eventType: "session.completed" }],
    });

    expect(snapshot.snapshotRefs).toEqual([{ refType: "eval_evidence_snapshot", refId: "snap_eval_001" }]);
    expect(snapshot.categories.find((entry) => entry.category === "mastery_evidence")).toMatchObject({
      status: "available",
      required: true,
      refs: [{ refType: "turn", refId: "turn_001" }],
    });
    expect(snapshot.categories.find((entry) => entry.category === "quiz_attempts")).toMatchObject({
      status: "skipped",
      required: false,
      skipReason: "no_quiz_attempt_records",
    });
  });

  it("converts snapshots into assertion persistence evidence", () => {
    const snapshot = buildEvalEvidenceSnapshot({
      id: "snap_eval_002",
      notebookId: "nb_eval_002",
      capturedAt: "2026-05-22T00:01:00.000Z",
      masteryEvidence: [{ ref: { refType: "turn", refId: "turn_002" }, overallScore: 0.7, confidence: 0.8 }],
      artifacts: [{ ref: { refType: "artifact", refId: "artifact_1" }, status: "ready" }],
      sessionEvents: [{ ref: { refType: "session", refId: "sess_002" }, eventType: "session.completed" }],
      traitRecommendationOnlySnapshot: {
        before: forbiddenSnapshot({ traitEstimateRefs: [{ refType: "trait_estimate", refId: "te_before" }] }),
        after: forbiddenSnapshot({
          traitEstimateRefs: [{ refType: "trait_estimate", refId: "te_after" }],
          personalizationRecommendationRefs: [{ refType: "personalization_recommendation", refId: "pr_1" }],
        }),
      },
    });

    const persistence = evalEvidenceSnapshotToPersistenceEvidence(snapshot);
    expect(persistence.masteryEvidence).toHaveLength(1);
    expect(persistence.artifacts).toHaveLength(1);
    expect(persistence.sessionEvents).toHaveLength(1);
    expect(persistence.traitRecommendationOnlySnapshot?.after.personalizationRecommendationRefs).toHaveLength(1);
  });

  it("reports required snapshot category gaps", () => {
    const snapshot = buildEvalEvidenceSnapshot({
      id: "snap_eval_003",
      notebookId: "nb_eval_003",
      capturedAt: "2026-05-22T00:01:00.000Z",
    });

    expect(missingRequiredSnapshotCategories(snapshot)).toEqual(["mastery_evidence"]);
  });

  it("tracks explicit learner goals and source readiness in forbidden trait deltas", () => {
    const before = buildEvalEvidenceSnapshot({
      id: "snap_before",
      notebookId: "nb_trait",
      capturedAt: "2026-05-22T00:00:00.000Z",
      explicitLearnerGoals: [{ refType: "notebook", refId: "nb_trait", summary: "Pass the exam" }],
      readinessStates: [{ sourceId: "src_1", tutoringReady: false, wikiReady: false, graphReady: false }],
    });
    const after = buildEvalEvidenceSnapshot({
      id: "snap_after",
      notebookId: "nb_trait",
      capturedAt: "2026-05-22T00:05:00.000Z",
      explicitLearnerGoals: [
        { refType: "notebook", refId: "nb_trait", summary: "Pass the exam" },
        { refType: "notebook", refId: "nb_trait", summary: "Master derivatives" },
      ],
      readinessStates: [{ sourceId: "src_1", tutoringReady: true, wikiReady: false, graphReady: false }],
      learnerTraitEstimates: [{ ref: { refType: "trait_estimate", refId: "te_1" } }],
    });

    const delta = buildTraitRecommendationOnlySnapshot({ before, after });
    expect(delta.after.explicitLearnerGoalRefs).toHaveLength(2);
    expect(delta.before.readinessRefs).toEqual([{ refType: "source", refId: "src_1:t=false:w=false:g=false" }]);
    expect(delta.after.readinessRefs).toEqual([{ refType: "source", refId: "src_1:t=true:w=false:g=false" }]);
    expect(extractForbiddenProductStateFromSnapshot(after).traitEstimateRefs).toEqual([
      { refType: "trait_estimate", refId: "te_1" },
    ]);
  });
});
