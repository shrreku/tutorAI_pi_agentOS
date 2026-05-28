import { describe, expect, it } from "vitest";
import {
  createSyntheticLearnerTriggerAdapter,
  loadTracerBulletSyntheticLearnerEvalMatrix,
  runSyntheticLearnerEvalScenario,
  runSyntheticLearnerEvalSuite,
  type SyntheticLearnerModelClient,
  type SyntheticLearnerEvalRunnerApi,
} from "./synthetic-learner-evals.runner.js";
import type { SyntheticLearnerAssertionPersistenceEvidence } from "./synthetic-learner-evals.assertions.js";

function createSuccessApi(): SyntheticLearnerEvalRunnerApi {
  return {
    async seedNotebook() {
      return {
        notebookId: "nb_eval_live_001",
        notebookRef: { refType: "notebook", refId: "nb_eval_live_001" },
        traceRefs: [
          { refType: "session", refId: "seed_trace_1" },
          { refType: "source", refId: "source_derivatives_primer" },
          { refType: "chunk", refId: "chunk_derivative_definition" },
        ],
      };
    },
    async sendTutorTurn() {
      return {
        sessionId: "sess_live_001",
        runId: "run_live_001",
        assistantMessage: "The derivative is the instantaneous rate of change.",
        traceRefs: [{ refType: "session", refId: "sess_live_001" }],
        events: [
          { source: "tutor", eventType: "TEXT_MESSAGE_START", payload: {} },
          {
            source: "tutor",
            eventType: "TEXT_MESSAGE_CONTENT",
            payload: { text: "The derivative is the instantaneous rate of change." },
          },
          { source: "tutor", eventType: "TOOL_CALL_START", payload: { toolName: "notebook.search" } },
          { source: "tutor", eventType: "TOOL_CALL_COMPLETE", payload: { toolName: "notebook.search" } },
          { source: "tutor", eventType: "TOOL_CALL_COMPLETE", payload: { toolName: "artifact.create_quiz" } },
          {
            source: "runtime",
            eventType: "learning.evaluate_response",
            payload: { status: "pending", timestamp: "2026-05-22T00:00:30.000Z" },
          },
          {
            source: "runtime",
            eventType: "artifact.created",
            payload: { status: "ready", timestamp: "2026-05-22T00:00:31.000Z" },
          },
          {
            source: "runtime",
            eventType: "session.digest.created",
            payload: { status: "ready", timestamp: "2026-05-22T00:00:32.000Z" },
          },
          {
            source: "notebook",
            eventType: "session.context.selected",
            payload: { sessionId: "sess_live_001" },
          },
          { source: "tutor", eventType: "TEXT_MESSAGE_END", payload: {} },
        ],
      };
    },
  };
}

function createFailureApi(): SyntheticLearnerEvalRunnerApi {
  return {
    async seedNotebook() {
      return { notebookId: "nb_eval_live_002" };
    },
    async sendTutorTurn() {
      throw new Error("Tutor stream disconnected");
    },
  };
}

function createSuccessPersistenceEvidence(): SyntheticLearnerAssertionPersistenceEvidence {
  return {
    masteryEvidence: [
      {
        ref: { refType: "turn", refId: "turn_mastery_001" },
        correctnessLabel: "partial",
        overallScore: 0.68,
        confidence: 0.72,
      },
    ],
    artifacts: [{ ref: { refType: "artifact", refId: "artifact_quiz_1" }, status: "ready" }],
    sessionEvents: [
      {
        ref: { refType: "session", refId: "sess_live_001" },
        eventType: "session.completed",
        timestamp: "2026-05-22T00:00:32.000Z",
      },
      {
        ref: { refType: "session", refId: "sess_live_001" },
        eventType: "session.digest.created",
        timestamp: "2026-05-22T00:00:33.000Z",
      },
    ],
  };
}

describe("synthetic learner eval runner", () => {
  it("runs a deterministic scripted scenario and records transcript and trace refs", async () => {
    const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
    const lines: string[] = [];

    const result = await runSyntheticLearnerEvalScenario({
      matrix,
      scenarioId: "scenario_lesson_remediation",
      personaId: "persona_beginner_misconception",
      api: createSuccessApi(),
      persistenceEvidence: createSuccessPersistenceEvidence(),
      writeTranscript: (line) => {
        lines.push(line);
      },
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:01:00.000Z",
      runId: "slrun_traceable_live_run",
    });

    expect(result.runRecord.status).toBe("passed");
    expect(result.scenarioRun.status).toBe("passed");
    expect(result.scenarioRun.steps).toHaveLength(result.scenario.beats.length);
    expect(result.scenarioRun.traceRefs).toEqual(
      expect.arrayContaining([
        { refType: "notebook", refId: "nb_eval_live_001" },
        { refType: "session", refId: "seed_trace_1" },
        { refType: "session", refId: "sess_live_001" },
      ]),
    );
    expect(result.scenarioRun.assertions.some((assertion) => assertion.details.reason === "unavailable_required_snapshot")).toBe(false);
    expect(lines).toEqual(
      expect.arrayContaining([
        "STUDENT: Teach me the topic and check whether I am missing a key idea.",
        "TOOL START: notebook.search",
        "TOOL COMPLETE: notebook.search",
        "RUNTIME: learning.evaluate_response",
        "NOTEBOOK EVENT: session.context.selected",
        "FINAL: passed - Scenario completed cleanly.",
      ]),
    );
  });

  it("runs beat LLM mode with generated learner wording and records simulator metadata", async () => {
    const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
    const prompts: string[] = [];
    const sentMessages: string[] = [];
    const api = createSuccessApi();
    const originalSendTutorTurn = api.sendTutorTurn;
    api.sendTutorTurn = async (input) => {
      sentMessages.push(input.scriptedMessage);
      return originalSendTutorTurn(input);
    };
    const model: SyntheticLearnerModelClient = {
      async generateActionDecision(input) {
        prompts.push(input.prompt);
        return {
          action: "chat.respond",
          rationale: "Respond naturally while preserving the beat.",
          learnerMessage: "I'm stuck on what instantaneous rate of change really means.",
        };
      },
      async generateLearnerResponse() {
        throw new Error("beat_llm should not need a second response prompt for chat.respond.");
      },
    };

    const result = await runSyntheticLearnerEvalScenario({
      matrix,
      scenarioId: "scenario_lesson_remediation",
      personaId: "persona_beginner_misconception",
      api,
      persistenceEvidence: createSuccessPersistenceEvidence(),
      learnerMode: "beat_llm",
      syntheticLearnerModel: model,
      simulatorModelConfig: {
        provider: "stub",
        model: "stub-synthetic-learner",
        temperature: 0,
        maxActionRepairAttempts: 1,
      },
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:01:00.000Z",
      runId: "slrun_beat_llm",
    });

    expect(sentMessages[0]).toBe("I'm stuck on what instantaneous rate of change really means.");
    expect(result.scenarioRun.learnerMode).toBe("beat_llm");
    expect(result.scenarioRun.simulatorModel?.model).toBe("stub-synthetic-learner");
    expect(prompts[0]).toContain("Learner mode: beat_llm");
    expect(prompts[0]).toContain("Beat instruction:");
    expect(prompts[0]).not.toContain("learner_visible_no_id_leak");
  });

  it("runs scenario-autonomous LLM actions with repair feedback and typed observations", async () => {
    const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
    let actionCalls = 0;
    const lines: string[] = [];
    const model: SyntheticLearnerModelClient = {
      async generateActionDecision(input) {
        actionCalls += 1;
        if (actionCalls === 1) {
          return { action: "artifact.open", rationale: "Unsupported action name." };
        }
        return { action: "artifact.list", rationale: "Check available artifacts before asking the tutor." };
      },
      async generateLearnerResponse({ observation }) {
        return {
          learnerFacingText: `I saw ${String(observation.data.count)} artifact available. Can you help me use it?`,
          internalRationale: "Ask a learner-facing follow-up after observing artifacts.",
        };
      },
    };

    const api = createSuccessApi();
    const originalSendTutorTurn = api.sendTutorTurn;
    api.sendTutorTurn = async (input) => {
      const turn = await originalSendTutorTurn(input);
      return {
        ...turn,
        assistantMessage: "I created a source-grounded quiz with source refs for your revision.",
      };
    };

    const result = await runSyntheticLearnerEvalScenario({
      matrix,
      scenarioId: "scenario_artifact_request",
      personaId: "persona_anxious_exam_prep",
      api,
      persistenceEvidence: createSuccessPersistenceEvidence(),
      learnerMode: "scenario_autonomous_llm",
      syntheticLearnerModel: model,
      simulatorModelConfig: {
        provider: "stub",
        model: "stub-synthetic-learner",
        temperature: 0,
        maxActionRepairAttempts: 1,
      },
      simulatorActions: {
        async execute({ decision }) {
          expect(decision.action).toBe("artifact.list");
          return {
            action: "artifact.list",
            status: "ok",
            summary: "Listed learner-visible artifacts.",
            data: { count: 1 },
            evidenceRefs: [{ refType: "artifact", refId: "artifact_quiz_1" }],
          };
        },
      },
      writeTranscript: (line) => {
        lines.push(line);
      },
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:01:00.000Z",
      runId: "slrun_scenario_autonomous",
    });

    expect(result.scenarioRun.status).toBe("passed");
    expect(result.scenarioRun.learnerMode).toBe("scenario_autonomous_llm");
    expect(result.scenarioRun.actionRepairAttempts).toBe(1);
    expect(result.scenarioRun.simulatorEvidence[0]?.eventType).toBe("action_repaired");
    expect(result.scenarioRun.artifactRefs).toEqual([{ refType: "artifact", refId: "artifact_quiz_1" }]);
    expect(lines).toEqual(expect.arrayContaining(["SIMULATOR ACTION: artifact.list", "SIMULATOR OBSERVATION: ok - Listed learner-visible artifacts."]));
  });

  it("runs full-autonomous LLM with oriented start context and session finish", async () => {
    const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
    const prompts: string[] = [];
    const result = await runSyntheticLearnerEvalScenario({
      matrix,
      scenarioId: "scenario_session_completion",
      personaId: "persona_overconfident_skimmer",
      api: createSuccessApi(),
      persistenceEvidence: createSuccessPersistenceEvidence(),
      learnerMode: "full_autonomous_llm",
      autonomyStartProfile: "oriented_entry",
      syntheticLearnerModel: {
        async generateActionDecision(input) {
          prompts.push(input.prompt);
          return { action: "session.finish", rationale: "The learner is done.", finishReason: "Finished autonomous smoke path." };
        },
        async generateLearnerResponse() {
          throw new Error("session.finish should not request a learner response.");
        },
      },
      simulatorActions: {
        async execute({ decision }) {
          return {
            action: decision.action,
            status: "finished",
            summary: decision.finishReason ?? "Finished.",
            data: {},
            evidenceRefs: [],
          };
        },
      },
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:01:00.000Z",
      runId: "slrun_full_autonomous",
    });

    expect(result.scenarioRun.learnerMode).toBe("full_autonomous_llm");
    expect(result.scenarioRun.autonomyStartProfile).toBe("oriented_entry");
    expect(prompts[0]).toContain("Learner-visible source summary");
    expect(prompts[0]).not.toContain("assertion");
    expect(result.scenarioRun.finalState.summary).toBe("Finished autonomous smoke path.");
  });

  it("fails the run when the tutor stream errors and surfaces the error in the transcript", async () => {
    const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
    const lines: string[] = [];

    const result = await runSyntheticLearnerEvalScenario({
      matrix,
      scenarioId: "scenario_lesson_remediation",
      personaId: "persona_beginner_misconception",
      api: createFailureApi(),
      writeTranscript: (line) => {
        lines.push(line);
      },
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:00:05.000Z",
      runId: "slrun_traceable_live_run",
    });

    expect(result.runRecord.status).toBe("failed");
    expect(result.scenarioRun.status).toBe("failed");
    expect(result.scenarioRun.finalState.summary).toContain("Tutor stream disconnected");
    expect(lines).toContain("ERROR: Tutor stream disconnected");
    expect(lines.at(-1)).toBe("FINAL: failed - Tutor stream disconnected");
  });

  it("executes the full 1 x 3 x 3 tracer bullet suite", async () => {
    const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
    const lines: string[] = [];

    const result = await runSyntheticLearnerEvalSuite({
      matrix,
      api: createSuccessApi(),
      persistenceEvidence: createSuccessPersistenceEvidence(),
      writeTranscript: (line) => {
        lines.push(line);
      },
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:09:00.000Z",
      runId: "slrun_traceable_suite",
    });

    expect(result.runRecord.status).toBe("passed");
    expect(result.scenarioRuns).toHaveLength(9);
    expect(new Set(result.scenarioRuns.map((run) => `${run.personaId}:${run.scenarioId}`))).toHaveLength(9);
    expect(result.runRecord.scenarioRuns).toHaveLength(9);
    expect(result.runRecord.transcript[0]).toBe("RUN STARTED: slrun_traceable_suite");
    expect(result.runRecord.transcript.at(-1)).toBe("FINAL: passed - All 9 scenario runs passed.");
    expect(lines).toEqual(
      expect.arrayContaining([
        "SCENARIO COUNT: 9",
        "SUITE SCENARIO START: persona_beginner_misconception / scenario_lesson_remediation",
        "SUITE SCENARIO END: persona_anxious_exam_prep / scenario_session_completion => passed",
      ]),
    );
  });

  it("records browser golden journey steps and screenshot evidence", async () => {
    const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
    const lines: string[] = [];

    const result = await runSyntheticLearnerEvalScenario({
      matrix,
      scenarioId: "scenario_artifact_request",
      personaId: "persona_anxious_exam_prep",
      api: createSuccessApi(),
      persistenceEvidence: createSuccessPersistenceEvidence(),
      browserExecutor: async ({ step }) => ({
        status: "passed",
        message: `${step.action} passed`,
        screenshotRefs: step.screenshotRef ? [step.screenshotRef] : [],
        evidenceRefs: [{ refType: "notebook", refId: "nb_eval_live_001" }],
      }),
      writeTranscript: (line) => {
        lines.push(line);
      },
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:01:00.000Z",
      runId: "slrun_browser_golden",
    });

    expect(result.scenarioRun.status).toBe("passed");
    expect(result.scenarioRun.steps.some((step) => step.kind === "browser")).toBe(true);
    expect(result.scenarioRun.screenshotRefs).toEqual([
      { refType: "screenshot", refId: "screenshot_artifact_no_object_leak" },
    ]);
    expect(result.scenarioRun.assertions.some((assertion) => assertion.category === "browser")).toBe(true);
    expect(lines).toEqual(expect.arrayContaining(["BROWSER PASSED: check_absence passed"]));
  });

  it("delegates optional Trigger-style invocation to the repo-native suite runner", async () => {
    const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
    const adapter = createSyntheticLearnerTriggerAdapter();

    const result = await adapter.invoke({
      matrix,
      api: createSuccessApi(),
      persistenceEvidence: createSuccessPersistenceEvidence(),
      triggerRunId: "scheduled_001",
      scenarioIds: ["scenario_lesson_remediation"],
      personaIds: ["persona_beginner_misconception"],
      startedAt: "2026-05-22T00:00:00.000Z",
      completedAt: "2026-05-22T00:01:00.000Z",
    });

    expect(result.runRecord.id).toBe("slrun_trigger_scheduled_001");
    expect(result.scenarioRuns).toHaveLength(1);
    expect(result.runRecord.status).toBe("passed");
  });
});
