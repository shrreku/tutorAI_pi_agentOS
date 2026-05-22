import type {
  EvalSourceFixtureManifest,
  SyntheticLearnerPersona,
  SyntheticLearnerScenario,
} from "./synthetic-learner-evals.js";

const syntheticLearnerEvalTracerBulletFixtureState = {
  notebook: {
    title: "Eval Fixture: Derivatives Primer",
    description: "Pre-ingested tutoring-ready state for API-only synthetic learner evals.",
    goal: "Help learners reason about derivatives with source-grounded tutoring.",
    defaultMode: "tutor",
    settingsJson: {
      evalOwnership: {
        kind: "eval_fixture",
        fixtureId: "fixture_synthetic_learner_001",
      },
    },
  },
  sources: [
    {
      id: "source_derivatives_primer",
      title: "Derivatives primer",
      sourceType: "document",
      originalObjectKey: "eval-fixtures/fixture_synthetic_learner_001/derivatives-primer.md",
      status: "ready",
      metadataJson: {
        topic: "derivatives",
        sourceContentHash: "sha256:8d8e9c5f1b0a1d1e1b1a8f0f0a2f4adf5d3f0d2c5a0e6b7a9d4f3c2b1a0d9e8f",
      },
    },
  ],
  sourceVersions: [
    {
      id: "source_version_derivatives_primer",
      sourceId: "source_derivatives_primer",
      version: 1,
      parserName: "eval-fixture",
      parserVersion: "2026.05.22",
      contentHash: "sha256:8d8e9c5f1b0a1d1e1b1a8f0f0a2f4adf5d3f0d2c5a0e6b7a9d4f3c2b1a0d9e8f",
      parseConfidence: 1,
      documentTreeJson: {
        type: "document",
        title: "Derivatives primer",
        children: [
          {
            type: "heading",
            title: "Derivative definition",
            children: [],
          },
        ],
      },
      createdAt: "2026-05-22T00:00:00.000Z",
    },
  ],
  chunks: [
    {
      id: "chunk_derivative_definition",
      sourceVersionId: "source_version_derivatives_primer",
      parentChunkId: null,
      chunkType: "retrieval",
      text: "The derivative measures instantaneous rate of change as the limit of the average rate of change.",
      tokenCount: 17,
      sourceSpanJson: {
        sourceId: "source_derivatives_primer",
        pageStart: 1,
        pageEnd: 1,
        startOffset: 0,
        endOffset: 110,
      },
      pageStart: 1,
      pageEnd: 1,
      headingPath: ["Derivative definition"],
      metadataJson: {
        topic: "derivatives",
        sourceKind: "eval_fixture",
      },
    },
  ],
  concepts: [
    {
      id: "concept_derivative",
      canonicalName: "Derivative",
      aliases: ["differentiation"],
      conceptType: "core",
      description: "The rate-of-change concept introduced by a limit process.",
      confidence: 0.98,
      metadataJson: {
        sourceContentHash: "sha256:8d8e9c5f1b0a1d1e1b1a8f0f0a2f4adf5d3f0d2c5a0e6b7a9d4f3c2b1a0d9e8f",
      },
    },
  ],
  curricula: [
    {
      id: "curriculum_derivatives",
      title: "Derivatives primer",
      curriculumType: "source_coverage",
      scopeJson: {
        sourceIds: ["source_derivatives_primer"],
      },
      status: "active",
      activeModuleId: "module_derivative_basics",
      sourceIds: ["source_derivatives_primer"],
      coverageSummaryJson: {
        ready: true,
        totalTopics: 1,
      },
      confidence: 0.96,
      createdByRunId: null,
    },
  ],
  curriculumModules: [
    {
      id: "module_derivative_basics",
      curriculumId: "curriculum_derivatives",
      title: "Derivative basics",
      summary: "Start from the definition and a worked example.",
      orderIndex: 0,
      status: "active",
      sourceRefsJson: [{ refType: "source", refId: "source_derivatives_primer" }],
      targetConceptIds: ["concept_derivative"],
      prerequisiteModuleIds: [],
      estimatedSessionCount: 1,
      coverageRequirementsJson: { minSources: 1 },
      masteryGateJson: { minConfidence: 0.8 },
    },
  ],
  objectiveLists: [
    {
      id: "objective_list_derivatives",
      curriculumId: "curriculum_derivatives",
      moduleId: "module_derivative_basics",
      title: "Tutor objectives",
      status: "active",
      currentObjectiveId: "objective_derivative_definition",
      objectiveIdsOrdered: ["objective_derivative_definition"],
      coverageSnapshotJson: { ready: true },
      createdByRunId: null,
    },
  ],
  objectives: [
    {
      id: "objective_derivative_definition",
      curriculumId: "curriculum_derivatives",
      title: "Explain the derivative definition",
      status: "not_started",
      orderIndex: 0,
      prerequisiteConceptIds: [],
      targetConceptIds: ["concept_derivative"],
      successCriteriaJson: {
        explains_limit_definition: true,
      },
      sourceRefsJson: [{ refType: "chunk", refId: "chunk_derivative_definition" }],
      suggestedMode: "explore",
      readinessScore: 0.9,
    },
  ],
  sessionPlans: [
    {
      id: "session_plan_derivatives",
      curriculumId: "curriculum_derivatives",
      moduleId: "module_derivative_basics",
      objectiveListId: "objective_list_derivatives",
      title: "API tutor session plan",
      status: "active",
      sessionGoal: "Guide the learner through the derivative definition.",
      plannedObjectiveIds: ["objective_derivative_definition"],
      openerJson: {
        prompt: "Teach me the derivative definition and correct me if I miss a step.",
      },
      diagnosticQuestionIds: [],
      teachingArcIds: [],
      artifactRefsJson: [],
      exitCriteriaJson: { mastered: true },
      recommendationReasonJson: {},
      createdByRunId: null,
    },
  ],
  wikiPages: [
    {
      id: "wiki_page_derivative",
      pageType: "concept",
      pageKey: "concept_derivative",
      title: "Derivative",
      version: 1,
      status: "published",
      structuredJson: {
        conceptId: "concept_derivative",
      },
      markdown: "# Derivative\n\nA derivative measures instantaneous rate of change.",
      sourceClaimIds: [],
      sourceChunkIds: ["chunk_derivative_definition"],
      confidenceSummaryJson: {
        supported: true,
      },
      qualityScore: 0.96,
    },
  ],
} as const;

export const syntheticLearnerEvalTracerBulletFixture: EvalSourceFixtureManifest = {
  id: "fixture_synthetic_learner_001",
  version: "1.0.0",
  sourceContentHash: "sha256:8d8e9c5f1b0a1d1e1b1a8f0f0a2f4adf5d3f0d2c5a0e6b7a9d4f3c2b1a0d9e8f",
  generationMetadata: {
    generatedBy: "studyagent-ingestion",
    pipelineVersion: "ingestion@2026.05.22",
    schemaVersion: "synthetic-learner-evals@1",
    generatedAt: "2026-05-22T00:00:00.000Z",
    sourceRevision: "frozen-eval-fixture",
    modelProvider: "openrouter",
    modelName: "gpt-4.1",
  },
  readinessChecks: [
    {
      id: "ready_chunks",
      label: "Retrieval chunks available",
      passed: true,
      details: { chunkCount: 1 },
    },
    {
      id: "ready_concepts",
      label: "Concept inventory populated",
      passed: true,
      details: { conceptCount: 1 },
    },
    {
      id: "ready_curriculum",
      label: "Curriculum bootstrap present",
      passed: true,
      details: { curriculumCount: 1, sessionPlanCount: 1 },
    },
  ],
  expectedTopics: ["derivatives"],
  expectedConcepts: ["Derivative"],
  expectedCitations: [
    {
      refType: "chunk",
      refId: "chunk_derivative_definition",
      label: "Derivative definition chunk",
    },
  ],
  compatibilityStatus: "compatible",
  ingestionPipelineVersion: "ingestion@2026.05.22",
  schemaVersion: "synthetic-learner-evals@1",
  generatedAt: "2026-05-22T00:00:00.000Z",
  compatible: true,
  seededNotebookId: "nb_eval_fixture_001",
  learnerAnalyticsScope: "eval_only",
  notes: "Frozen eval source fixture for the first synthetic learner tracer bullet.",
  tutoringReadyState: syntheticLearnerEvalTracerBulletFixtureState,
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

export const syntheticLearnerEvalSourceFixtures = {
  [syntheticLearnerEvalTracerBulletFixture.id]: syntheticLearnerEvalTracerBulletFixture,
} as const;
