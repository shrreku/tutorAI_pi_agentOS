import { describe, expect, it } from "vitest";
import {
  loadTracerBulletSyntheticLearnerEvalMatrix,
  runSyntheticLearnerEvalScenario,
  runSyntheticLearnerEvalSuite,
  type SyntheticLearnerEvalRunnerApi,
} from "./synthetic-learner-evals.runner.js";

function createSuccessApi(): SyntheticLearnerEvalRunnerApi {
  return {
    async seedNotebook() {
      return {
        notebookId: "nb_eval_live_001",
        notebookRef: { refType: "notebook", refId: "nb_eval_live_001" },
        traceRefs: [{ refType: "session", refId: "seed_trace_1" }],
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
          {
            source: "runtime",
            eventType: "learning.evaluate_response",
            payload: { status: "pending", timestamp: "2026-05-22T00:00:30.000Z" },
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

describe("synthetic learner eval runner", () => {
  it("runs a deterministic scripted scenario and records transcript and trace refs", async () => {
    const matrix = loadTracerBulletSyntheticLearnerEvalMatrix();
    const lines: string[] = [];

    const result = await runSyntheticLearnerEvalScenario({
      matrix,
      scenarioId: "scenario_lesson_remediation",
      personaId: "persona_beginner_misconception",
      api: createSuccessApi(),
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
    expect(result.scenarioRun.assertions.some((assertion) => assertion.status === "skipped")).toBe(true);
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
});
