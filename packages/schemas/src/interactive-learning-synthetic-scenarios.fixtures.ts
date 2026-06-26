import type {
  InteractiveLearningActionName,
  InteractiveLearningBlockKind,
} from "./interactive-learning.js";
import { syntheticLearnerEvalTracerBulletFixture } from "./synthetic-learner-evals.fixtures.js";

export type InteractiveLearningSyntheticAssertionRef = {
  refType: "assertion";
  refId: string;
  required?: boolean;
};

export type InteractiveLearningSyntheticStep = {
  id: string;
  label: string;
  actionName?: InteractiveLearningActionName;
  blockId: string;
  artifactId?: string;
  actionPayload?: unknown;
  expectsDispatch: boolean;
  persistsMasteryEvidence: boolean;
  persistsCurriculumMutation: boolean;
  assertionRefs: InteractiveLearningSyntheticAssertionRef[];
};

export type InteractiveLearningSyntheticScenario = {
  id: string;
  name: string;
  runKind: "regression";
  sourceFixtureId: string;
  blockKind: InteractiveLearningBlockKind;
  learningContext: "tutor_led" | "self_review";
  steps: InteractiveLearningSyntheticStep[];
  assertionRefs: InteractiveLearningSyntheticAssertionRef[];
};

export const interactiveLearningSyntheticContext = {
  notebookId: "nb_il_regression",
  surfaceId: "surface_il_regression",
  nodeRef: { refType: "artifact" as const, refId: "art_il_regression" },
  sessionId: "sess_il_regression",
  rendererKind: "mcp_app" as const,
  rendererVersion: "v1",
  createdAt: "2026-06-08T12:00:00.000Z",
};

const sharedRegressionAssertions: InteractiveLearningSyntheticAssertionRef[] = [
  { refType: "assertion", refId: "learner_visible_no_id_leak" },
  { refType: "assertion", refId: "learner_visible_source_refs" },
];

export const interactiveLearningSyntheticScenarios: InteractiveLearningSyntheticScenario[] = [
  {
    id: "scenario_il_quiz_incorrect_mastery",
    name: "Quiz incorrect answer records mastery evidence",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    blockKind: "quiz",
    learningContext: "tutor_led",
    steps: [
      {
        id: "step_quiz_incorrect_answer",
        label: "Learner submits an incorrect quiz answer through the action dispatcher",
        actionName: "quiz.answer_submitted",
        blockId: "interactive_quiz_art_il_regression",
        artifactId: "art_il_quiz",
        actionPayload: {
          questionId: "q_derivative_definition",
          answer: "Any secant line slope",
          isCorrect: false,
          conceptIds: ["concept_derivative"],
        },
        expectsDispatch: true,
        persistsMasteryEvidence: true,
        persistsCurriculumMutation: false,
        assertionRefs: [
          { refType: "assertion", refId: "runtime_mastery_evidence" },
          { refType: "assertion", refId: "persistence_conservative_movement" },
        ],
      },
    ],
    assertionRefs: [
      ...sharedRegressionAssertions,
      { refType: "assertion", refId: "runtime_mastery_evidence" },
      { refType: "assertion", refId: "persistence_conservative_movement" },
    ],
  },
  {
    id: "scenario_il_flashcard_flip_vs_rating",
    name: "Flashcard flip stays passive while rating persists review",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    blockKind: "flashcard_deck",
    learningContext: "self_review",
    steps: [
      {
        id: "step_flashcard_flip",
        label: "Learner flips a card without dispatching a durable action",
        blockId: "interactive_flashcards_art_il_regression",
        expectsDispatch: false,
        persistsMasteryEvidence: false,
        persistsCurriculumMutation: false,
        assertionRefs: [{ refType: "assertion", refId: "runtime_interactive_passive_only" }],
      },
      {
        id: "step_flashcard_rating",
        label: "Learner rates recall and triggers durable review persistence",
        actionName: "flashcard.review_rated",
        blockId: "interactive_flashcards_art_il_regression",
        artifactId: "art_il_flashcards",
        actionPayload: {
          cardId: "card_derivative_definition",
          result: "again",
          conceptIds: ["concept_derivative"],
        },
        expectsDispatch: true,
        persistsMasteryEvidence: false,
        persistsCurriculumMutation: false,
        assertionRefs: [
          { refType: "assertion", refId: "runtime_artifact_lifecycle" },
          { refType: "assertion", refId: "persistence_conservative_movement" },
        ],
      },
    ],
    assertionRefs: [
      ...sharedRegressionAssertions,
      { refType: "assertion", refId: "runtime_interactive_passive_only" },
      { refType: "assertion", refId: "runtime_artifact_lifecycle" },
    ],
  },
  {
    id: "scenario_il_worked_example_hint_vs_answer",
    name: "Worked example hint is passive while step answer persists",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    blockKind: "worked_example",
    learningContext: "tutor_led",
    steps: [
      {
        id: "step_worked_example_hint",
        label: "Learner reveals a hint without mastery mutation",
        actionName: "worked_example.step_revealed",
        blockId: "interactive_worked_example_art_il_regression",
        artifactId: "art_il_worked_example",
        actionPayload: {
          stepId: "step_1",
        },
        expectsDispatch: true,
        persistsMasteryEvidence: false,
        persistsCurriculumMutation: false,
        assertionRefs: [{ refType: "assertion", refId: "runtime_interactive_passive_only" }],
      },
      {
        id: "step_worked_example_answer",
        label: "Learner submits a step answer that persists artifact state",
        actionName: "worked_example.step_answered",
        blockId: "interactive_worked_example_art_il_regression",
        artifactId: "art_il_worked_example",
        actionPayload: {
          stepId: "step_1",
          answer: "Apply the power rule.",
          isCorrect: true,
        },
        expectsDispatch: true,
        persistsMasteryEvidence: false,
        persistsCurriculumMutation: false,
        assertionRefs: [
          { refType: "assertion", refId: "runtime_artifact_lifecycle" },
          { refType: "assertion", refId: "persistence_artifact_status" },
        ],
      },
    ],
    assertionRefs: [
      ...sharedRegressionAssertions,
      { refType: "assertion", refId: "runtime_interactive_passive_only" },
      { refType: "assertion", refId: "runtime_artifact_lifecycle" },
    ],
  },
  {
    id: "scenario_il_evidence_explorer_span_open",
    name: "Evidence explorer source span open stays passive",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    blockKind: "evidence_explorer",
    learningContext: "self_review",
    steps: [
      {
        id: "step_evidence_span_open",
        label: "Learner opens a source span for inspection",
        actionName: "evidence.source_span_opened",
        blockId: "interactive_evidence_art_il_regression",
        actionPayload: {
          evidenceRefId: "chunk_derivative_definition",
        },
        expectsDispatch: true,
        persistsMasteryEvidence: false,
        persistsCurriculumMutation: false,
        assertionRefs: [
          { refType: "assertion", refId: "runtime_interactive_passive_only" },
          { refType: "assertion", refId: "learner_visible_source_refs" },
        ],
      },
    ],
    assertionRefs: [
      ...sharedRegressionAssertions,
      { refType: "assertion", refId: "runtime_interactive_passive_only" },
    ],
  },
  {
    id: "scenario_il_simulation_observation",
    name: "Simulation observation submission persists learner input",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    blockKind: "simulation",
    learningContext: "self_review",
    steps: [
      {
        id: "step_simulation_observation",
        label: "Learner submits an observation after manipulating parameters",
        actionName: "simulation.observation_submitted",
        blockId: "interactive_simulation_art_il_regression",
        actionPayload: {
          observation: "The parabola opens upward when a is positive.",
          parameterSnapshot: { a: 1, b: 0, c: -2 },
        },
        expectsDispatch: true,
        persistsMasteryEvidence: false,
        persistsCurriculumMutation: false,
        assertionRefs: [
          { refType: "assertion", refId: "runtime_artifact_lifecycle" },
          { refType: "assertion", refId: "persistence_artifact_status" },
        ],
      },
    ],
    assertionRefs: [
      ...sharedRegressionAssertions,
      { refType: "assertion", refId: "runtime_artifact_lifecycle" },
    ],
  },
  {
    id: "scenario_il_live_plan_intent",
    name: "Live Plan intent updates focus without mastery mutation",
    runKind: "regression",
    sourceFixtureId: syntheticLearnerEvalTracerBulletFixture.id,
    blockKind: "live_plan",
    learningContext: "self_review",
    steps: [
      {
        id: "step_live_plan_intent",
        label: "Learner selects a next-step intent from Live Plan",
        actionName: "live_plan.action_selected",
        blockId: "interactive_live_plan_art_il_regression",
        actionPayload: {
          actionId: "focus_derivative_definition",
          label: "Review derivative definition",
        },
        expectsDispatch: true,
        persistsMasteryEvidence: false,
        persistsCurriculumMutation: false,
        assertionRefs: [
          { refType: "assertion", refId: "persistence_interactive_no_mastery_mutation" },
          { refType: "assertion", refId: "persistence_interactive_no_curriculum_mutation" },
        ],
      },
    ],
    assertionRefs: [
      ...sharedRegressionAssertions,
      { refType: "assertion", refId: "persistence_interactive_no_mastery_mutation" },
      { refType: "assertion", refId: "persistence_interactive_no_curriculum_mutation" },
    ],
  },
];
