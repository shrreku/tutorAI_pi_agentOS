import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { artifacts, concepts, curriculumModules, notebooks } from "@studyagent/db";
import type { InteractiveLearningBlock } from "@studyagent/schemas";
import type { AppContext } from "./context.js";
import { dispatchInteractiveLearningAction } from "./interactive-learning-actions.js";
import { registerInteractiveLearningRoutes } from "./routes/interactive-learning.js";

const {
  appendEventMock,
  recordQuizAttemptMock,
  recordFlashcardReviewMock,
  buildReferenceSurfaceMock,
  createOpenRouterMasteryEvaluatorJudgeMock,
  masteryJudgeMock,
  persistPersonalizationPreferenceMock,
  mergeInteractiveBlockStateMock,
  loadInteractiveBlockStateMock,
  persistSimulationObservationMock,
} = vi.hoisted(() => ({
  appendEventMock: vi.fn(async () => ({ id: "evt_1" })),
  recordQuizAttemptMock: vi.fn(async () => ({
    attemptId: "qat_1",
    updatedConceptStates: [
      { conceptId: "concept_1", masteryScore: 0.8, nextReviewAt: "2026-06-09T00:00:00.000Z" },
    ],
  })),
  recordFlashcardReviewMock: vi.fn(async () => ({ updatedConceptStates: [] })),
  buildReferenceSurfaceMock: vi.fn(),
  createOpenRouterMasteryEvaluatorJudgeMock: vi.fn((_env: unknown) => undefined as unknown),
  masteryJudgeMock: vi.fn(async () => ({
    correctnessLabel: "correct",
    overallScore: 0.92,
    confidence: 0.86,
    uncertainty: 0.14,
    misconceptions: [],
    tutoringIntervention: "advance",
    notes: "The answer is conceptually correct.",
  })),
  persistPersonalizationPreferenceMock: vi.fn(async (..._args: unknown[]) => undefined),
  mergeInteractiveBlockStateMock: vi.fn(async (..._args: unknown[]) => ({})),
  loadInteractiveBlockStateMock: vi.fn(
    async (..._args: unknown[]) => ({}) as Record<string, unknown>,
  ),
  persistSimulationObservationMock: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("./auth.js", () => ({
  resolveActor: vi.fn(async () => ({ id: "user_1" })),
}));

vi.mock("./agentic-cache-invalidation.js", () => ({
  appendEventWithTutorCacheInvalidation: appendEventMock,
}));

vi.mock("./assessment-artifacts.js", () => ({
  recordQuizAttempt: recordQuizAttemptMock,
  recordFlashcardReview: recordFlashcardReviewMock,
}));

vi.mock("./reference-surface.js", () => ({
  buildReferenceSurface: (...args: unknown[]) => buildReferenceSurfaceMock(...args),
}));

vi.mock("./mastery-llm-judge.js", () => ({
  createOpenRouterMasteryEvaluatorJudge: (env: unknown) =>
    createOpenRouterMasteryEvaluatorJudgeMock(env),
}));

vi.mock("./interactive-learning-personalization.js", () => ({
  persistPersonalizationPreference: (...args: unknown[]) =>
    persistPersonalizationPreferenceMock(...args),
}));

vi.mock("./interactive-learning-state.js", () => ({
  loadInteractiveBlockState: (...args: unknown[]) => loadInteractiveBlockStateMock(...args),
  mergeInteractiveBlockState: (...args: unknown[]) => mergeInteractiveBlockStateMock(...args),
  persistSimulationObservation: (...args: unknown[]) => persistSimulationObservationMock(...args),
}));

class FakeDb {
  constructor(
    private readonly notebookFound = true,
    private readonly artifactId?: string,
  ) {}

  update() {
    return {
      set: () => ({
        where: async () => undefined,
      }),
    };
  }

  select() {
    return {
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === notebooks && this.notebookFound) {
              return [{ id: "nb_1", ownerId: "user_1" }];
            }
            if (table === artifacts) {
              const rows = [
                {
                  id: "art_quiz",
                  notebookId: "nb_1",
                  artifactType: "quiz",
                  status: "ready",
                  payloadJson: {
                    conceptIds: ["mod_1"],
                    questions: [
                      {
                        id: "q1",
                        conceptIds: ["mod_1"],
                        prompt: "How does heat move by conduction?",
                        referenceAnswer: "Heat moves by direct contact.",
                        explanation: "Focus on contact.",
                      },
                    ],
                  },
                },
                {
                  id: "art_flash",
                  notebookId: "nb_1",
                  artifactType: "flashcards",
                  status: "ready",
                  payloadJson: {
                    cards: [{ id: "card_1", conceptId: "concept_1", front: "Q", back: "A" }],
                  },
                },
                {
                  id: "art_worked",
                  notebookId: "nb_1",
                  artifactType: "worked_example",
                  status: "ready",
                  payloadJson: {
                    steps: [{ id: "step_1", prompt: "Solve", hint: "Use Fourier's law" }],
                  },
                },
              ];
              if (this.artifactId) {
                return rows.filter((row) => row.id === this.artifactId);
              }
              return rows;
            }
            if (table === concepts) {
              return [{ id: "concept_1", notebookId: "nb_1", canonicalName: "Conduction" }];
            }
            if (table === curriculumModules) {
              return [{ id: "mod_1", notebookId: "nb_1", targetConceptIds: ["concept_1"] }];
            }
            return [];
          },
        }),
      }),
    };
  }
}

const quizBlock: InteractiveLearningBlock = {
  id: "interactive_quiz_art_quiz",
  kind: "quiz",
  title: "Quiz",
  learningPurpose: "Practice",
  surfaceRole: "primary",
  nodeRef: { refType: "artifact", refId: "art_quiz" },
  artifactRef: { refType: "artifact", refId: "art_quiz" },
  objectiveRefs: [],
  conceptRefs: [],
  sourceRefs: [],
  evidenceRefs: [],
  prompt: null,
  content: { questions: [{ id: "q1", prompt: "?" }] },
  canonicalState: { attempts: [], questionCount: 1, completedQuestionIds: [] },
  allowedActions: ["quiz.answer_submitted", "tutor.help_requested"],
  rendererPreference: "mcp_app",
  fallbackSummary: "1 practice question(s).",
  quality: { sourceBacked: false, needsReview: false },
};

function surfaceWithBlocks(blocks: InteractiveLearningBlock[]) {
  return {
    id: "surface_art_quiz",
    notebookId: "nb_1",
    nodeRef: { refType: "artifact", refId: "art_quiz" },
    title: "Quiz",
    surfaceType: "artifact" as const,
    summary: null,
    status: "Ready to study",
    blocks: [],
    interactiveBlocks: blocks,
    scopeRefs: [],
    sourceRefs: [],
    coverageRefs: [],
    primaryActions: ["ask_tutor", "quiz"] as const,
    quality: { confidence: null, sourceBacked: false, needsReview: false },
  };
}

describe("interactive learning actions", () => {
  beforeEach(() => {
    appendEventMock.mockClear();
    recordQuizAttemptMock.mockClear();
    recordFlashcardReviewMock.mockClear();
    createOpenRouterMasteryEvaluatorJudgeMock.mockReset();
    createOpenRouterMasteryEvaluatorJudgeMock.mockReturnValue(undefined);
    masteryJudgeMock.mockClear();
    persistPersonalizationPreferenceMock.mockClear();
    mergeInteractiveBlockStateMock.mockClear();
    loadInteractiveBlockStateMock.mockClear();
    persistSimulationObservationMock.mockClear();
    buildReferenceSurfaceMock.mockReset();
    buildReferenceSurfaceMock
      .mockResolvedValueOnce(surfaceWithBlocks([quizBlock]))
      .mockResolvedValueOnce(
        surfaceWithBlocks([
          {
            ...quizBlock,
            canonicalState: {
              attempts: [
                { questionId: "q1", isCorrect: true, createdAt: "2026-06-08T00:00:00.000Z" },
              ],
              questionCount: 1,
              completedQuestionIds: ["q1"],
            },
          },
        ]),
      );
  });

  it("rejects malformed action envelopes", async () => {
    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb() }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: { actionName: "quiz.answer_submitted" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("bad_request");
    }
  });

  it("rejects actions for notebooks the user does not own", async () => {
    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb(false) }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_quiz_art_quiz",
        nodeRef: { refType: "artifact", refId: "art_quiz" },
        artifactId: "art_quiz",
        actionName: "quiz.answer_submitted",
        actionPayload: {
          questionId: "q1",
          answer: "By contact",
          isCorrect: true,
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("not_found");
    }
  });

  it("routes quiz answer submission through server-evaluated recordQuizAttempt and returns updated block state", async () => {
    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb() }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_quiz_art_quiz",
        nodeRef: { refType: "artifact", refId: "art_quiz" },
        artifactId: "art_quiz",
        actionName: "quiz.answer_submitted",
        actionPayload: {
          questionId: "q1",
          answer: "It moves by direct contact.",
          isCorrect: true,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(recordQuizAttemptMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          notebookId: "nb_1",
          userId: "user_1",
          artifactId: "art_quiz",
          questionId: "q1",
          conceptIds: ["concept_1"],
          isCorrect: true,
          score: 0.9,
        }),
      );
      expect(result.response.block.canonicalState).toEqual(
        expect.objectContaining({
          completedQuestionIds: ["q1"],
        }),
      );
      expect(result.response.emitsMasteryEvidence).toBe(true);
    }
  });

  it("uses the configured LLM judge for conceptual quiz answers instead of trusting string matching", async () => {
    createOpenRouterMasteryEvaluatorJudgeMock.mockReturnValueOnce(masteryJudgeMock);
    masteryJudgeMock.mockResolvedValueOnce({
      correctnessLabel: "correct",
      overallScore: 0.92,
      confidence: 0.86,
      uncertainty: 0.14,
      misconceptions: [],
      tutoringIntervention: "advance",
      notes:
        "The learner correctly described conduction as heat transfer caused by a temperature difference.",
    });

    const result = await dispatchInteractiveLearningAction({
      ctx: {
        db: { db: new FakeDb() },
        env: { OPENROUTER_API_KEY: "sk-test" },
      } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_quiz_art_quiz",
        nodeRef: { refType: "artifact", refId: "art_quiz" },
        artifactId: "art_quiz",
        actionName: "quiz.answer_submitted",
        actionPayload: {
          questionId: "q1",
          answer: "It happens because of conduction due to a temperature difference in the medium.",
          isCorrect: false,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(createOpenRouterMasteryEvaluatorJudgeMock).toHaveBeenCalledWith(
      expect.objectContaining({ OPENROUTER_API_KEY: "sk-test" }),
    );
    expect(masteryJudgeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        learnerAnswer:
          "It happens because of conduction due to a temperature difference in the medium.",
        referenceAnswer: "Heat moves by direct contact.",
      }),
    );
    expect(recordQuizAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isCorrect: true,
        score: 0.92,
        evaluation: expect.objectContaining({
          correctnessLabel: "correct",
          evaluatorProvenance: expect.objectContaining({ mode: "llm" }),
        }),
      }),
    );
  });

  it("records passive evidence opens without mastery evidence", async () => {
    const evidenceBlock: InteractiveLearningBlock = {
      ...quizBlock,
      id: "interactive_evidence_art_quiz",
      kind: "evidence_explorer",
      allowedActions: ["evidence.source_span_opened", "tutor.help_requested"],
    };

    buildReferenceSurfaceMock.mockReset();
    buildReferenceSurfaceMock
      .mockResolvedValueOnce(surfaceWithBlocks([evidenceBlock]))
      .mockResolvedValueOnce(surfaceWithBlocks([evidenceBlock]));

    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb() }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_evidence_art_quiz",
        nodeRef: { refType: "artifact", refId: "art_quiz" },
        actionName: "evidence.source_span_opened",
        actionPayload: { evidenceRefId: "chunk_1" },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.emitsMasteryEvidence).toBe(false);
      expect(appendEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "source.viewer.opened" }),
      );
    }
  });

  it("records flashcard ratings without emitting mastery evidence", async () => {
    const flashcardBlock: InteractiveLearningBlock = {
      ...quizBlock,
      id: "interactive_flashcards_art_flash",
      kind: "flashcard_deck",
      artifactRef: { refType: "artifact", refId: "art_flash" },
      allowedActions: ["flashcard.review_rated"],
      content: { cards: [{ id: "card_1", front: "Q", back: "A" }] },
      canonicalState: { reviews: [] },
    };

    buildReferenceSurfaceMock.mockReset();
    buildReferenceSurfaceMock
      .mockResolvedValueOnce(surfaceWithBlocks([flashcardBlock]))
      .mockResolvedValueOnce(surfaceWithBlocks([flashcardBlock]));

    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb(true, "art_flash") }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_flashcards_art_flash",
        nodeRef: { refType: "artifact", refId: "art_flash" },
        artifactId: "art_flash",
        actionName: "flashcard.review_rated",
        actionPayload: { cardId: "card_1", result: "good" },
        sessionId: "sess_1",
        runId: "run_1",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(recordFlashcardReviewMock).toHaveBeenCalled();
      expect(result.response.emitsMasteryEvidence).toBe(false);
    }
  });

  it("accepts worked example hint reveal with stepId only", async () => {
    const workedBlock: InteractiveLearningBlock = {
      ...quizBlock,
      id: "interactive_worked_example_art_worked",
      kind: "worked_example",
      artifactRef: { refType: "artifact", refId: "art_worked" },
      allowedActions: ["worked_example.step_revealed", "worked_example.step_answered"],
      content: { steps: [{ id: "step_1", prompt: "Solve" }] },
      canonicalState: { stepAnswers: [] },
    };

    buildReferenceSurfaceMock.mockReset();
    buildReferenceSurfaceMock
      .mockResolvedValueOnce(surfaceWithBlocks([workedBlock]))
      .mockResolvedValueOnce(surfaceWithBlocks([workedBlock]));

    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb(true, "art_worked") }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_worked_example_art_worked",
        nodeRef: { refType: "artifact", refId: "art_worked" },
        artifactId: "art_worked",
        actionName: "worked_example.step_revealed",
        actionPayload: { stepId: "step_1" },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.emitsMasteryEvidence).toBe(false);
      expect(appendEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "artifact.updated" }),
      );
    }
  });

  it("records live plan intent actions as passive session focus updates", async () => {
    const livePlanBlock: InteractiveLearningBlock = {
      ...quizBlock,
      id: "interactive_live_plan_nb_1",
      kind: "live_plan",
      nodeRef: { refType: "notebook", refId: "nb_1" },
      artifactRef: undefined,
      allowedActions: ["live_plan.action_selected"],
      content: { nextActions: [{ id: "slow_down", label: "Slow down" }] },
      canonicalState: {},
    };

    buildReferenceSurfaceMock.mockReset();
    buildReferenceSurfaceMock
      .mockResolvedValueOnce(surfaceWithBlocks([livePlanBlock]))
      .mockResolvedValueOnce(surfaceWithBlocks([livePlanBlock]));

    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb() }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_live_plan_nb_1",
        nodeRef: { refType: "notebook", refId: "nb_1" },
        actionName: "live_plan.action_selected",
        actionPayload: { actionId: "slow_down" },
        sessionId: "sess_1",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.emitsMasteryEvidence).toBe(false);
      expect(appendEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "session.focus.updated" }),
      );
    }
  });

  it("records tutor help requests without mastery evidence", async () => {
    buildReferenceSurfaceMock.mockReset();
    buildReferenceSurfaceMock
      .mockResolvedValueOnce(surfaceWithBlocks([quizBlock]))
      .mockResolvedValueOnce(surfaceWithBlocks([quizBlock]));

    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb() }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_quiz_art_quiz",
        nodeRef: { refType: "artifact", refId: "art_quiz" },
        actionName: "tutor.help_requested",
        actionPayload: { message: "Explain question 1" },
        sessionId: "sess_1",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.emitsMasteryEvidence).toBe(false);
      expect(appendEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "tutor.checkpoint.requested" }),
      );
    }
  });

  it("persists personalization preference updates", async () => {
    const personalizationBlock: InteractiveLearningBlock = {
      ...quizBlock,
      id: "interactive_personalization_nb_1",
      kind: "personalization_controls",
      nodeRef: { refType: "notebook", refId: "nb_1" },
      allowedActions: ["personalization.preference_updated"],
      content: { preferences: [] },
      canonicalState: { updatedPreferences: [] },
    };

    buildReferenceSurfaceMock.mockReset();
    buildReferenceSurfaceMock
      .mockResolvedValueOnce(surfaceWithBlocks([personalizationBlock]))
      .mockResolvedValueOnce(surfaceWithBlocks([personalizationBlock]));

    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb() }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_personalization_nb_1",
        nodeRef: { refType: "notebook", refId: "nb_1" },
        actionName: "personalization.preference_updated",
        actionPayload: { preference: "pace", value: "slow" },
        sessionId: "sess_1",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(persistPersonalizationPreferenceMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ preference: "pace", value: "slow" }),
      );
      expect(mergeInteractiveBlockStateMock).toHaveBeenCalled();
    }
  });

  it("records simulation parameter snapshots as passive observations", async () => {
    const simulationBlock: InteractiveLearningBlock = {
      ...quizBlock,
      id: "interactive_simulation_cnc_1",
      kind: "simulation",
      nodeRef: { refType: "concept", refId: "cnc_1" },
      allowedActions: ["simulation.parameter_snapshot_submitted"],
      content: { parameters: [] },
      canonicalState: { observations: [] },
    };

    buildReferenceSurfaceMock.mockReset();
    buildReferenceSurfaceMock
      .mockResolvedValueOnce(surfaceWithBlocks([simulationBlock]))
      .mockResolvedValueOnce(surfaceWithBlocks([simulationBlock]));

    const result = await dispatchInteractiveLearningAction({
      ctx: { db: { db: new FakeDb() }, env: {} } as unknown as AppContext,
      notebookId: "nb_1",
      userId: "user_1",
      envelope: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_simulation_cnc_1",
        nodeRef: { refType: "concept", refId: "cnc_1" },
        actionName: "simulation.parameter_snapshot_submitted",
        actionPayload: {
          observation: "k increased, temperature gradient steepened",
          parameterSnapshot: { k: 2 },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(persistSimulationObservationMock).toHaveBeenCalled();
      expect(result.response.emitsMasteryEvidence).toBe(false);
    }
  });
});

describe("interactive learning routes", () => {
  it("registers POST /notebooks/:notebookId/interactive-learning/actions", async () => {
    buildReferenceSurfaceMock.mockReset();
    buildReferenceSurfaceMock
      .mockResolvedValueOnce(surfaceWithBlocks([quizBlock]))
      .mockResolvedValueOnce(
        surfaceWithBlocks([
          {
            ...quizBlock,
            canonicalState: {
              attempts: [
                { questionId: "q1", isCorrect: true, createdAt: "2026-06-08T00:00:00.000Z" },
              ],
              questionCount: 1,
              completedQuestionIds: ["q1"],
            },
          },
        ]),
      );

    const app = Fastify();
    await registerInteractiveLearningRoutes(app, {
      db: { db: new FakeDb() },
      env: {},
    } as unknown as AppContext);

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/interactive-learning/actions",
      payload: {
        notebookId: "nb_1",
        surfaceId: "surface_art_quiz",
        blockId: "interactive_quiz_art_quiz",
        nodeRef: { refType: "artifact", refId: "art_quiz" },
        artifactId: "art_quiz",
        actionName: "quiz.answer_submitted",
        actionPayload: {
          questionId: "q1",
          answer: "By contact",
          isCorrect: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        ok: true,
        actionName: "quiz.answer_submitted",
      }),
    );
  });
});
