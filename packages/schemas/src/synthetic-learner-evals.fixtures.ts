import type {
  EvalSourceFixtureManifest,
  SyntheticLearnerPersona,
  SyntheticLearnerRubricDefinition,
  SyntheticLearnerScenario,
} from "./synthetic-learner-evals.js";
import { getLearnerTraitArchetype, learnerTraitArchetypeFixtures, type LearnerTraitArchetype } from "./learner-traits.js";

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

function requiredLearnerTraitArchetype(id: string): LearnerTraitArchetype {
  const archetype = getLearnerTraitArchetype(id);
  if (!archetype) {
    throw new Error(`Missing Learner Trait Archetype fixture: ${id}`);
  }
  return archetype;
}

function learnerLevelForArchetype(archetype: LearnerTraitArchetype): SyntheticLearnerPersona["learnerLevel"] {
  if (archetype.id === "beginner_misconception" || archetype.id === "help_avoidant_stuck") return "beginner";
  if (archetype.id === "fast_advanced") return "advanced";
  return "intermediate";
}

function responsePolicyForArchetype(archetype: LearnerTraitArchetype): SyntheticLearnerPersona["responsePolicy"] {
  const tone = archetype.id === "overconfident_skimmer"
    ? "direct"
    : archetype.id === "anxious_exam_prep" || archetype.id === "low_confidence_high_mastery"
      ? "encouraging"
      : "supportive";
  const brevity = archetype.traitValues.pacePreference === "fast"
    ? "short"
    : archetype.traitValues.depthPreference === "formal"
      ? "detailed"
      : "balanced";

  return {
    mode: "scripted",
    tone,
    brevity,
    askClarifyingQuestions: archetype.traitValues.helpSeekingStyle === "asks_early",
    referenceSourceMaterial: true,
    stayInCharacter: true,
    constraints: ["avoid raw IDs", "avoid debug narration"],
  };
}

export function buildSyntheticLearnerPersonaFromArchetype(archetype: LearnerTraitArchetype): SyntheticLearnerPersona {
  return {
    id: `persona_${archetype.id}`,
    name: archetype.label,
    mode: "scripted",
    traitArchetypeId: archetype.id,
    traitValues: archetype.traitValues,
    backgroundSummary: archetype.syntheticPersonaSeed.backgroundSummary,
    goalSummary: archetype.syntheticPersonaSeed.goalSummary,
    learnerLevel: learnerLevelForArchetype(archetype),
    behaviors: archetype.syntheticPersonaSeed.behaviors,
    misconceptions: archetype.syntheticPersonaSeed.misconceptions,
    studyHabits: archetype.syntheticPersonaSeed.studyHabits,
    responsePolicy: responsePolicyForArchetype(archetype),
  };
}

export const syntheticLearnerTraitArchetypePersonas: SyntheticLearnerPersona[] =
  learnerTraitArchetypeFixtures.map(buildSyntheticLearnerPersonaFromArchetype);

export const syntheticLearnerEvalTracerBulletPersonas: SyntheticLearnerPersona[] = [
  requiredLearnerTraitArchetype("beginner_misconception"),
  requiredLearnerTraitArchetype("overconfident_skimmer"),
  requiredLearnerTraitArchetype("anxious_exam_prep"),
].map(buildSyntheticLearnerPersonaFromArchetype);

export const syntheticLearnerEvalTracerBulletScenarios: SyntheticLearnerScenario[] = [
  {
    id: "scenario_lesson_remediation",
    name: "Lesson and remediation",
    kind: "lesson_and_remediation",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    personaIds: syntheticLearnerEvalTracerBulletPersonas.map((persona) => persona.id),
    beats: [
      {
        id: "beat_opening",
        kind: "opening",
        scriptedMessage: "Teach me the topic and check whether I am missing a key idea.",
        liveInstruction: "Open with a learner message that asks for foundational help and admits uncertainty.",
        allowedActions: ["ask_question", "request_hint"],
        stopConditions: [],
        assertionRefs: [{ refType: "assertion", refId: "learner_visible_no_id_leak" }],
      },
      {
        id: "beat_checkpoint",
        kind: "checkpoint",
        scriptedMessage: "I think the rule is about slope, but I may be mixing things up.",
        liveInstruction: "Let the learner surface a partial misconception that can be corrected by the tutor.",
        allowedActions: ["answer_question", "correct_mistake", "request_hint"],
        stopConditions: ["mastery_reached"],
        assertionRefs: [],
      },
      {
        id: "beat_remediation",
        kind: "remediation",
        scriptedMessage: "Tangent line. I was mixing it up with the secant line because the formula starts from two points.",
        liveInstruction: "Answer the tutor's checkpoint with a corrected explanation that still mentions the earlier misconception.",
        allowedActions: ["ask_question", "request_summary", "correct_mistake"],
        stopConditions: ["turn_limit"],
        assertionRefs: [
          { refType: "assertion", refId: "runtime_mastery_evidence" },
          { refType: "assertion", refId: "persistence_conservative_movement" },
        ],
      },
    ],
    maxTurns: 3,
    stopConditions: ["turn_limit", "mastery_reached"],
    allowedActions: ["ask_question", "answer_question", "request_hint", "correct_mistake"],
    assertionRefs: [
      { refType: "assertion", refId: "learner_visible_no_id_leak" },
      { refType: "assertion", refId: "runtime_mastery_evidence" },
      { refType: "assertion", refId: "persistence_conservative_movement" },
    ],
    browserSteps: [],
    rubricRefs: [],
    entryPrompt: "Teach me the topic and help me recover from a partial mistake.",
    objectiveId: "obj_derivatives_1",
  },
  {
    id: "scenario_artifact_request",
    name: "Artifact request",
    kind: "artifact_request",
    runKind: "golden_journey",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    personaIds: syntheticLearnerEvalTracerBulletPersonas.map((persona) => persona.id),
    beats: [
      {
        id: "beat_request",
        kind: "request",
        scriptedMessage: "Can you make me a quiz I can study from?",
        liveInstruction: "Ask for a study artifact rather than a direct lesson answer.",
        allowedActions: ["request_artifact", "ask_question"],
        stopConditions: [],
        assertionRefs: [{ refType: "assertion", refId: "learner_visible_source_grounded_artifact" }],
      },
      {
        id: "beat_generation",
        kind: "generation",
        scriptedMessage: "Please keep it tied to the source and make it useful for revision.",
        liveInstruction: "Signal that the learner wants a source-grounded artifact and can review it.",
        allowedActions: ["request_artifact", "request_summary"],
        stopConditions: ["artifact_delivered"],
        assertionRefs: [{ refType: "assertion", refId: "runtime_artifact_lifecycle" }],
      },
      {
        id: "beat_review",
        kind: "review",
        scriptedMessage: "That works. I'll review it and come back if I get stuck.",
        liveInstruction: "Conclude with a review-and-return stance that keeps the artifact in scope.",
        allowedActions: ["ask_question", "request_summary", "end_session"],
        stopConditions: ["turn_limit"],
        assertionRefs: [{ refType: "assertion", refId: "persistence_artifact_status" }],
      },
    ],
    maxTurns: 3,
    stopConditions: ["artifact_delivered", "turn_limit"],
    allowedActions: ["ask_question", "request_artifact", "request_summary", "end_session"],
    assertionRefs: [
      { refType: "assertion", refId: "learner_visible_source_grounded_artifact" },
      { refType: "assertion", refId: "learner_visible_source_refs" },
      { refType: "assertion", refId: "runtime_artifact_lifecycle" },
      { refType: "assertion", refId: "persistence_artifact_status" },
    ],
    browserSteps: [
      {
        id: "browser_open_workspace_artifact",
        action: "open_workspace",
        target: "workspace",
        path: "/notebooks/:notebookId",
        assertionRefs: [{ refType: "assertion", refId: "browser_workspace_loaded" }],
      },
      {
        id: "browser_check_artifact_no_object_leak",
        action: "check_absence",
        target: "artifact",
        path: "/notebooks/:notebookId/artifacts",
        absentText: "[object Object]",
        screenshotRef: { refType: "screenshot", refId: "screenshot_artifact_no_object_leak" },
        assertionRefs: [{ refType: "assertion", refId: "browser_artifact_no_object_leak" }],
      },
    ],
    rubricRefs: [],
    entryPrompt: "Create a quiz or worked example that I can study from.",
    objectiveId: "obj_derivatives_1",
  },
  {
    id: "scenario_session_completion",
    name: "Session completion",
    kind: "session_completion",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    personaIds: syntheticLearnerEvalTracerBulletPersonas.map((persona) => persona.id),
    beats: [
      {
        id: "beat_continue",
        kind: "continue",
        scriptedMessage: "Let's do one more recap before we finish.",
        liveInstruction: "Have the learner ask for one final recap while remaining ready to conclude.",
        allowedActions: ["request_summary", "ask_question"],
        stopConditions: [],
        assertionRefs: [],
      },
      {
        id: "beat_finish",
        kind: "finish",
        scriptedMessage: "Thanks, that's enough. Please summarize what I should do next.",
        liveInstruction: "End the session with a concise request for next steps and a final summary.",
        allowedActions: ["end_session", "request_summary"],
        stopConditions: ["session_concluded"],
        assertionRefs: [
          { refType: "assertion", refId: "runtime_session_digest" },
          { refType: "assertion", refId: "persistence_crystallization_boundary" },
          { refType: "assertion", refId: "report_final_state" },
        ],
      },
    ],
    maxTurns: 2,
    stopConditions: ["session_concluded", "turn_limit"],
    allowedActions: ["ask_question", "request_summary", "end_session"],
    assertionRefs: [
      { refType: "assertion", refId: "runtime_session_digest" },
      { refType: "assertion", refId: "persistence_crystallization_boundary" },
      { refType: "assertion", refId: "report_final_state" },
    ],
    browserSteps: [],
    rubricRefs: [],
    entryPrompt: "Let's finish this session and summarize what I should do next.",
    objectiveId: "obj_derivatives_1",
  },
];

export const syntheticLearnerEvalAutonomousDiscoveryScenario: SyntheticLearnerScenario = {
  id: "scenario_autonomous_discovery",
  name: "Autonomous discovery",
  kind: "lesson_and_remediation",
  runKind: "full_autonomous",
  sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
  personaIds: syntheticLearnerEvalTracerBulletPersonas.map((persona) => persona.id),
  beats: [
    {
      id: "beat_autonomous_start",
      kind: "opening",
      scriptedMessage: "I want to explore this topic in my own way. Let me ask follow-ups as I go.",
      liveInstruction: "Let the synthetic learner choose follow-up questions while staying inside the fixture source scope.",
      allowedActions: ["ask_question", "answer_question", "request_hint", "request_artifact", "inspect_artifact", "answer_quiz", "give_artifact_feedback", "request_summary", "end_session"],
      stopConditions: ["turn_limit", "invariant_failed", "user_requests_stop"],
      assertionRefs: [{ refType: "assertion", refId: "learner_visible_no_id_leak" }],
    },
  ],
  maxTurns: 6,
  stopConditions: ["turn_limit", "invariant_failed", "user_requests_stop"],
  allowedActions: ["ask_question", "answer_question", "request_hint", "request_artifact", "inspect_artifact", "answer_quiz", "give_artifact_feedback", "request_summary", "end_session"],
  autonomousConfig: {
    enabled: true,
    maxTurns: 6,
    allowedProductSurfaces: ["tutor_chat", "workspace", "source_wiki", "study_map", "artifacts"],
    invariantAssertionRefs: [
      { refType: "assertion", refId: "learner_visible_no_id_leak" },
      { refType: "assertion", refId: "learner_visible_source_refs" },
    ],
    durableWritesScope: "eval_owned_notebooks",
    gateStatus: "discovery_only",
  },
  assertionRefs: [
    { refType: "assertion", refId: "learner_visible_no_id_leak" },
    { refType: "assertion", refId: "learner_visible_source_refs" },
  ],
  browserSteps: [],
  rubricRefs: [],
  entryPrompt: "Explore the topic freely while staying source-grounded.",
  objectiveId: "obj_derivatives_1",
};

const traitEstimationAssertionRefs = [
  { refType: "assertion" as const, refId: "runtime_trait_estimation" },
  { refType: "assertion" as const, refId: "persistence_trait_estimates" },
  { refType: "assertion" as const, refId: "persistence_trait_recommendation_only" },
  { refType: "assertion" as const, refId: "persistence_trait_no_mastery_mutation" },
];

export const syntheticLearnerTraitEstimationScenarios: SyntheticLearnerScenario[] = [
  {
    id: "scenario_trait_explicit_preference_change",
    name: "Trait estimation explicit preference change",
    kind: "lesson_and_remediation",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    personaIds: ["persona_careful_self_explainer"],
    beats: [{
      id: "beat_explicit_preference",
      kind: "opening",
      scriptedMessage: "Please go slower and use visual examples before quizzing me.",
      liveInstruction: "State explicit pace and example preferences that should record trait signals.",
      allowedActions: ["ask_question", "request_hint"],
      stopConditions: ["turn_limit"],
      assertionRefs: [{ refType: "assertion", refId: "runtime_trait_estimation" }],
    }],
    maxTurns: 1,
    stopConditions: ["turn_limit"],
    allowedActions: ["ask_question", "request_hint"],
    assertionRefs: traitEstimationAssertionRefs,
    browserSteps: [],
    rubricRefs: [],
    entryPrompt: "Please go slower and use visual examples.",
    objectiveId: "obj_derivatives_1",
  },
  {
    id: "scenario_trait_overconfident_contradiction",
    name: "Trait estimation overconfident contradiction",
    kind: "lesson_and_remediation",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    personaIds: ["persona_overconfident_skimmer"],
    beats: [{
      id: "beat_overconfident_claim",
      kind: "checkpoint",
      scriptedMessage: "I already know this, but the derivative is just any line through two points.",
      liveInstruction: "Claim mastery while giving a partially wrong answer so confidence calibration can be estimated.",
      allowedActions: ["answer_question", "correct_mistake"],
      stopConditions: ["mastery_reached"],
      assertionRefs: [{ refType: "assertion", refId: "runtime_trait_estimation" }],
    }],
    maxTurns: 1,
    stopConditions: ["mastery_reached", "turn_limit"],
    allowedActions: ["answer_question", "correct_mistake"],
    assertionRefs: traitEstimationAssertionRefs,
    browserSteps: [],
    rubricRefs: [],
    entryPrompt: "I already know this. Test me quickly.",
    objectiveId: "obj_derivatives_1",
  },
  {
    id: "scenario_trait_help_avoidant_stuck",
    name: "Trait estimation help-avoidant stuck",
    kind: "lesson_and_remediation",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    personaIds: ["persona_help_avoidant_stuck"],
    beats: [{
      id: "beat_quietly_stuck",
      kind: "remediation",
      scriptedMessage: "I'm fine. I guess I will just reread it later.",
      liveInstruction: "Avoid asking for help despite being stuck so help-seeking signals can be estimated.",
      allowedActions: ["request_hint", "end_session"],
      stopConditions: ["turn_limit"],
      assertionRefs: [{ refType: "assertion", refId: "runtime_trait_estimation" }],
    }],
    maxTurns: 1,
    stopConditions: ["turn_limit"],
    allowedActions: ["request_hint", "end_session"],
    assertionRefs: traitEstimationAssertionRefs,
    browserSteps: [],
    rubricRefs: [],
    entryPrompt: "I am stuck but do not want a big explanation.",
    objectiveId: "obj_derivatives_1",
  },
  {
    id: "scenario_trait_exam_urgency",
    name: "Trait estimation exam urgency",
    kind: "artifact_request",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    personaIds: ["persona_anxious_exam_prep"],
    beats: [{
      id: "beat_exam_urgency",
      kind: "request",
      scriptedMessage: "My exam is tomorrow, so give me high-yield practice from the source.",
      liveInstruction: "State deadline pressure and request practice so urgency signals can be estimated.",
      allowedActions: ["request_artifact", "request_summary"],
      stopConditions: ["artifact_delivered"],
      assertionRefs: [{ refType: "assertion", refId: "runtime_trait_estimation" }],
    }],
    maxTurns: 1,
    stopConditions: ["artifact_delivered", "turn_limit"],
    allowedActions: ["request_artifact", "request_summary"],
    assertionRefs: traitEstimationAssertionRefs,
    browserSteps: [],
    rubricRefs: [],
    entryPrompt: "My exam is tomorrow; give me high-yield practice.",
    objectiveId: "obj_derivatives_1",
  },
  {
    id: "scenario_trait_low_confidence_high_mastery",
    name: "Trait estimation low confidence high mastery",
    kind: "lesson_and_remediation",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    personaIds: ["persona_low_confidence_high_mastery"],
    beats: [{
      id: "beat_low_confidence_strong_answer",
      kind: "checkpoint",
      scriptedMessage: "I'm probably wrong, but the derivative at a point is the limiting slope of secant lines approaching the tangent.",
      liveInstruction: "Give a strong answer with low confidence so confidence-support recommendations can be tested.",
      allowedActions: ["answer_question", "request_summary"],
      stopConditions: ["mastery_reached"],
      assertionRefs: [{ refType: "assertion", refId: "runtime_trait_estimation" }],
    }],
    maxTurns: 1,
    stopConditions: ["mastery_reached", "turn_limit"],
    allowedActions: ["answer_question", "request_summary"],
    assertionRefs: traitEstimationAssertionRefs,
    browserSteps: [],
    rubricRefs: [],
    entryPrompt: "I think I understand but I am not confident.",
    objectiveId: "obj_derivatives_1",
  },
];

export const syntheticLearnerEvalRubrics: SyntheticLearnerRubricDefinition[] = [
  {
    id: "rubric_tutoring_quality",
    label: "Tutoring quality",
    qualitative: true,
    dimensions: ["explanation_clarity", "remediation_quality", "source_faithfulness", "persona_realism"],
    enabled: false,
  },
  {
    id: "rubric_artifact_quality",
    label: "Artifact quality",
    qualitative: true,
    dimensions: ["artifact_usefulness", "source_faithfulness"],
    enabled: false,
  },
];

export const syntheticLearnerEvalSourceFixtures = {
  [syntheticLearnerEvalTracerBulletFixture.id]: syntheticLearnerEvalTracerBulletFixture,
} as const;
