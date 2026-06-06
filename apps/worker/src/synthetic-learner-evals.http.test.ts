import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
  formatEvalRunPlanLine,
  planSyntheticLearnerEvalRun,
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalTracerBulletScenarios,
} from "@studyagent/schemas";
import { patchSyntheticLearnerEvalRun, persistSyntheticLearnerEvalRun } from "./synthetic-learner-evals.js";

describe("synthetic learner eval worker http helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists eval plans with the initial running eval run", async () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
      scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
    });
    const evalPlans = [
      planSyntheticLearnerEvalRun({
        scenario: { ...matrix.scenarios[0]!, runKind: "scenario_autonomous" },
        persona: matrix.personas[0]!,
        learnerMode: "scenario_autonomous_llm",
      }),
    ];
    const runRecord = buildSyntheticLearnerEvalRunRecord({
      matrix,
      runId: "slrun_worker_plan_persist",
      status: "running",
      startedAt: "2026-05-22T00:00:00.000Z",
      scenarioRuns: matrix.runs.slice(0, 1).map((run) => ({
        ...run,
        id: "slrun_worker_plan_persist_0",
        runId: "slrun_worker_plan_persist",
        fixtureVersion: matrix.fixture.version,
        status: "running",
        startedAt: "2026-05-22T00:00:00.000Z",
        steps: [],
        assertions: [],
        artifactRefs: [],
        screenshotRefs: [],
        traceRefs: [],
        notebookRefs: [{ refType: "notebook", refId: matrix.fixture.seededNotebookId }],
        runKind: "scenario_autonomous",
        learnerMode: "scenario_autonomous_llm",
        gatingPolicy: "non_ci_gating",
        rubricResults: [],
        evalEvidenceSnapshots: [],
        finalState: { passed: false, summary: "Eval Run is still executing." },
        evalPlan: evalPlans[0],
      })),
    });

    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ summary: {}, run: runRecord }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await persistSyntheticLearnerEvalRun("http://localhost:3000", undefined, runRecord);

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body ?? ""));
    expect(body.evalPlans).toHaveLength(1);
    expect(formatEvalRunPlanLine(body.evalPlans[0])).toContain("scenario=");
  });

  it("throws when live eval run patch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));

    await expect(
      patchSyntheticLearnerEvalRun("http://localhost:3000", undefined, {
        id: "slrun_live_patch_failure",
        status: "running",
        observationEvents: [],
      }),
    ).rejects.toThrow(/Failed to patch live eval run \(404\)/);
  });
});
