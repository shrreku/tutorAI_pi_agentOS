import { describe, expect, it } from "vitest";
import {
  interactiveLearningActionEnvelopeSchema,
  interactiveLearningActionNameSchema,
  PASSIVE_INTERACTIVE_ACTIONS,
  parseInteractiveLearningActionPayload,
  type InteractiveLearningActionEnvelope,
  type InteractiveLearningActionName,
} from "./interactive-learning.js";
import {
  interactiveLearningSyntheticContext,
  interactiveLearningSyntheticScenarios,
  type InteractiveLearningSyntheticScenario,
  type InteractiveLearningSyntheticStep,
} from "./interactive-learning-synthetic-scenarios.fixtures.js";
import { syntheticLearnerScenarioSchema } from "./synthetic-learner-evals.js";
import { syntheticLearnerEvalTracerBulletFixture } from "./synthetic-learner-evals.fixtures.js";

const MASTERY_PERSISTING_ACTIONS = new Set<InteractiveLearningActionName>(["quiz.answer_submitted"]);

function responseEmitsMasteryEvidence(actionName: InteractiveLearningActionName): boolean {
  return !PASSIVE_INTERACTIVE_ACTIONS.has(actionName);
}

function buildStepEnvelope(step: InteractiveLearningSyntheticStep): InteractiveLearningActionEnvelope | null {
  if (!step.expectsDispatch || !step.actionName) {
    return null;
  }

  return interactiveLearningActionEnvelopeSchema.parse({
    ...interactiveLearningSyntheticContext,
    blockId: step.blockId,
    ...(step.artifactId ? { artifactId: step.artifactId } : {}),
    actionName: step.actionName,
    actionPayload: step.actionPayload ?? {},
  });
}

function toSyntheticLearnerScenario(scenario: InteractiveLearningSyntheticScenario) {
  const dispatchedSteps = scenario.steps.filter((step) => step.expectsDispatch && step.actionName);

  return {
    id: scenario.id,
    name: scenario.name,
    kind: "artifact_request" as const,
    runKind: scenario.runKind,
    sourceFixtureId: scenario.sourceFixtureId,
    personaIds: ["persona_careful_self_explainer"],
    beats: dispatchedSteps.map((step, index) => ({
      id: `${scenario.id}_beat_${index + 1}`,
      kind: "review" as const,
      scriptedMessage: step.label,
      liveInstruction: step.label,
      allowedActions: ["inspect_artifact", "answer_quiz"] as const,
      stopConditions: [] as const,
      assertionRefs: step.assertionRefs,
    })),
    maxTurns: Math.max(dispatchedSteps.length, 1),
    stopConditions: ["turn_limit" as const],
    allowedActions: ["inspect_artifact", "answer_quiz"] as const,
    assertionRefs: scenario.assertionRefs,
    browserSteps: [],
    rubricRefs: [],
    entryPrompt: scenario.name,
    objectiveId: "obj_derivatives_1",
  };
}

describe("interactive learning synthetic learner scenarios", () => {
  it("defines six regression scenarios for interactive learning surfaces", () => {
    expect(interactiveLearningSyntheticScenarios).toHaveLength(6);
    expect(interactiveLearningSyntheticScenarios.map((scenario) => scenario.id)).toEqual([
      "scenario_il_quiz_incorrect_mastery",
      "scenario_il_flashcard_flip_vs_rating",
      "scenario_il_worked_example_hint_vs_answer",
      "scenario_il_evidence_explorer_span_open",
      "scenario_il_simulation_observation",
      "scenario_il_live_plan_intent",
    ]);
  });

  it("anchors every scenario to the tracer bullet eval fixture", () => {
    for (const scenario of interactiveLearningSyntheticScenarios) {
      expect(scenario.sourceFixtureId).toBe(syntheticLearnerEvalTracerBulletFixture.id);
      expect(scenario.runKind).toBe("regression");
    }
  });

  it("validates compatible synthetic learner scenario envelopes for dispatchable steps", () => {
    const parsed = syntheticLearnerScenarioSchema.array().parse(
      interactiveLearningSyntheticScenarios.map(toSyntheticLearnerScenario),
    );

    expect(parsed).toHaveLength(6);
    expect(parsed.every((scenario) => scenario.runKind === "regression")).toBe(true);
  });

  it("builds quiz incorrect-answer envelopes that route through mastery evidence", () => {
    const scenario = interactiveLearningSyntheticScenarios.find(
      (entry) => entry.id === "scenario_il_quiz_incorrect_mastery",
    )!;
    const step = scenario.steps[0]!;
    const envelope = buildStepEnvelope(step)!;

    expect(envelope.actionName).toBe("quiz.answer_submitted");
    expect(envelope).toMatchObject({
      notebookId: interactiveLearningSyntheticContext.notebookId,
      surfaceId: interactiveLearningSyntheticContext.surfaceId,
      blockId: step.blockId,
      artifactId: "art_il_quiz",
      rendererKind: "mcp_app",
      rendererVersion: "v1",
    });
    expect(envelope.actionPayload).toMatchObject({
      questionId: "q_derivative_definition",
      isCorrect: false,
    });
    expect(parseInteractiveLearningActionPayload(envelope.actionName, envelope.actionPayload).success).toBe(true);
    expect(responseEmitsMasteryEvidence(envelope.actionName)).toBe(true);
    expect(step.persistsMasteryEvidence).toBe(true);
  });

  it("distinguishes passive flashcard flips from durable review ratings", () => {
    const scenario = interactiveLearningSyntheticScenarios.find(
      (entry) => entry.id === "scenario_il_flashcard_flip_vs_rating",
    )!;
    const [flipStep, ratingStep] = scenario.steps;

    expect(buildStepEnvelope(flipStep!)).toBeNull();
    expect(flipStep).toMatchObject({
      expectsDispatch: false,
      persistsMasteryEvidence: false,
    });

    const ratingEnvelope = buildStepEnvelope(ratingStep!)!;
    expect(ratingEnvelope.actionName).toBe("flashcard.review_rated");
    expect(ratingEnvelope.actionPayload).toMatchObject({
      cardId: "card_derivative_definition",
      result: "again",
    });
    expect(responseEmitsMasteryEvidence(ratingEnvelope.actionName)).toBe(false);
    expect(ratingStep?.persistsMasteryEvidence).toBe(false);
    expect(scenario.learningContext).toBe("self_review");
  });

  it("distinguishes worked example hint reveal from step answer persistence", () => {
    const scenario = interactiveLearningSyntheticScenarios.find(
      (entry) => entry.id === "scenario_il_worked_example_hint_vs_answer",
    )!;
    const [hintStep, answerStep] = scenario.steps;

    const hintEnvelope = buildStepEnvelope(hintStep!)!;
    expect(hintEnvelope.actionName).toBe("worked_example.step_revealed");
    expect(responseEmitsMasteryEvidence(hintEnvelope.actionName)).toBe(false);
    expect(hintStep?.persistsMasteryEvidence).toBe(false);

    const answerEnvelope = buildStepEnvelope(answerStep!)!;
    expect(answerEnvelope.actionName).toBe("worked_example.step_answered");
    expect(responseEmitsMasteryEvidence(answerEnvelope.actionName)).toBe(true);
    expect(answerStep?.persistsMasteryEvidence).toBe(false);
  });

  it("keeps evidence explorer span opens passive", () => {
    const scenario = interactiveLearningSyntheticScenarios.find(
      (entry) => entry.id === "scenario_il_evidence_explorer_span_open",
    )!;
    const step = scenario.steps[0]!;
    const envelope = buildStepEnvelope(step)!;

    expect(envelope.actionName).toBe("evidence.source_span_opened");
    expect(envelope.actionPayload).toEqual({ evidenceRefId: "chunk_derivative_definition" });
    expect(PASSIVE_INTERACTIVE_ACTIONS.has(envelope.actionName)).toBe(true);
    expect(step.persistsMasteryEvidence).toBe(false);
    expect(step.persistsCurriculumMutation).toBe(false);
  });

  it("covers simulation observation submission envelopes", () => {
    const scenario = interactiveLearningSyntheticScenarios.find(
      (entry) => entry.id === "scenario_il_simulation_observation",
    )!;
    const step = scenario.steps[0]!;
    const envelope = buildStepEnvelope(step)!;

    expect(envelope.actionName).toBe("simulation.observation_submitted");
    expect(envelope.actionPayload).toMatchObject({
      observation: expect.stringContaining("parabola"),
      parameterSnapshot: { a: 1, b: 0, c: -2 },
    });
    expect(responseEmitsMasteryEvidence(envelope.actionName)).toBe(true);
    expect(step.persistsMasteryEvidence).toBe(false);
  });

  it("covers live plan intent without mastery or curriculum mutation", () => {
    const scenario = interactiveLearningSyntheticScenarios.find(
      (entry) => entry.id === "scenario_il_live_plan_intent",
    )!;
    const step = scenario.steps[0]!;
    const envelope = buildStepEnvelope(step)!;

    expect(envelope.actionName).toBe("live_plan.action_selected");
    expect(envelope.actionPayload).toMatchObject({
      actionId: "focus_derivative_definition",
      label: "Review derivative definition",
    });
    expect(step.persistsMasteryEvidence).toBe(false);
    expect(step.persistsCurriculumMutation).toBe(false);
    expect(scenario.assertionRefs.map((ref) => ref.refId)).toEqual(
      expect.arrayContaining([
        "persistence_interactive_no_mastery_mutation",
        "persistence_interactive_no_curriculum_mutation",
      ]),
    );
  });

  it("keeps mastery persistence expectations aligned with action taxonomy", () => {
    for (const scenario of interactiveLearningSyntheticScenarios) {
      for (const step of scenario.steps) {
        if (!step.actionName) {
          expect(step.persistsMasteryEvidence).toBe(false);
          continue;
        }

        expect(interactiveLearningActionNameSchema.safeParse(step.actionName).success).toBe(true);

        if (MASTERY_PERSISTING_ACTIONS.has(step.actionName)) {
          expect(step.persistsMasteryEvidence).toBe(true);
        }

        if (PASSIVE_INTERACTIVE_ACTIONS.has(step.actionName)) {
          expect(step.persistsMasteryEvidence).toBe(false);
        }
      }
    }
  });
});
