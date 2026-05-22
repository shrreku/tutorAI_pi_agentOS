import type {
  EvalSourceFixtureManifest,
  SyntheticLearnerPersona,
  SyntheticLearnerScenario,
} from "./synthetic-learner-evals.js";

export const syntheticLearnerEvalTracerBulletFixture: EvalSourceFixtureManifest = {
  id: "fixture_synthetic_learner_001",
  version: "1.0.0",
  sourceContentHash: "sha256:8d8e9c5f1b0a1d1e1b1a8f0f0a2f4adf5d3f0d2c5a0e6b7a9d4f3c2b1a0d9e8f",
  ingestionPipelineVersion: "ingestion@2026.05.22",
  schemaVersion: "synthetic-learner-evals@1",
  generatedAt: "2026-05-22T00:00:00.000Z",
  compatible: true,
  seededNotebookId: "nb_eval_fixture_001",
  learnerAnalyticsScope: "eval_only",
  notes: "Frozen eval source fixture for the first synthetic learner tracer bullet.",
};

export const syntheticLearnerEvalTracerBulletPersonas: SyntheticLearnerPersona[] = [
  {
    id: "persona_beginner_misconception",
    name: "Beginner with misconception",
    mode: "scripted",
    learnerSummary: "Confuses the target concept and needs guided remediation.",
    goalSummary: "Understand the lesson and correct the misconception.",
    styleHints: ["asks for step-by-step help", "needs concrete checkpoints"],
    forbiddenLeaks: ["raw IDs", "debug narration"],
  },
  {
    id: "persona_overconfident_skimmer",
    name: "Overconfident skimmer",
    mode: "scripted",
    learnerSummary: "Claims prior knowledge and tries to skip basics.",
    goalSummary: "Move quickly without losing mastery safeguards.",
    styleHints: ["rushes answers", "requests shorter explanations"],
    forbiddenLeaks: ["raw IDs", "debug narration"],
  },
  {
    id: "persona_anxious_exam_prep",
    name: "Anxious exam-prep learner",
    mode: "scripted",
    learnerSummary: "Wants revision help and reassurance before an exam.",
    goalSummary: "Get source-grounded study help and a clear next step.",
    styleHints: ["asks for quizzes", "wants a concrete artifact"],
    forbiddenLeaks: ["raw IDs", "debug narration"],
  },
];

export const syntheticLearnerEvalTracerBulletScenarios: SyntheticLearnerScenario[] = [
  {
    id: "scenario_lesson_remediation",
    name: "Lesson and remediation",
    kind: "lesson_and_remediation",
    entryPrompt: "Teach me the topic and help me recover from a partial mistake.",
    objectiveId: "obj_derivatives_1",
    beatIds: ["beat_opening", "beat_checkpoint", "beat_remediation"],
    expectedAssertions: ["learner_visible_no_id_leak", "runtime_mastery_evidence", "persistence_conservative_movement"],
  },
  {
    id: "scenario_artifact_request",
    name: "Artifact request",
    kind: "artifact_request",
    entryPrompt: "Create a quiz or worked example that I can study from.",
    objectiveId: "obj_derivatives_1",
    beatIds: ["beat_request", "beat_generation", "beat_review"],
    expectedAssertions: ["learner_visible_source_grounded_artifact", "runtime_artifact_lifecycle", "persistence_artifact_status"],
  },
  {
    id: "scenario_session_completion",
    name: "Session completion",
    kind: "session_completion",
    entryPrompt: "Let's finish this session and summarize what I should do next.",
    objectiveId: "obj_derivatives_1",
    beatIds: ["beat_continue", "beat_finish"],
    expectedAssertions: ["runtime_session_digest", "persistence_crystallization_boundary", "report_final_state"],
  },
];
