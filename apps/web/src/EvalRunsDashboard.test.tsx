import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import EvalRunsDashboard from "./EvalRunsDashboard.js";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
  planSyntheticLearnerEvalRun,
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalTracerBulletScenarios,
} from "@studyagent/schemas";

function renderDashboard(runRecord = buildRunRecord("passed")) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  client.setQueryData(["eval-runs"], {
    runs: [{ summary: summarizeRun(runRecord), run: runRecord }],
  });
  client.setQueryData(["eval-run", runRecord.id], {
    summary: summarizeRun(runRecord),
    run: runRecord,
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <EvalRunsDashboard
        selectedRunId={runRecord.id}
        onSelectRun={() => {}}
        onBackToNotebooks={() => {}}
      />
    </QueryClientProvider>,
  );
}

function buildRunRecord(status: "passed" | "failed") {
  const matrix = buildSyntheticLearnerEvalMatrix({
    fixture: syntheticLearnerEvalTracerBulletFixture,
    personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
    scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
  });

  return buildSyntheticLearnerEvalRunRecord({
    matrix,
    runId: `slrun_dashboard_${status}`,
    startedAt: "2026-05-22T00:00:00.000Z",
    completedAt: "2026-05-22T00:01:00.000Z",
    transcript: ["RUN STARTED", `FINAL: ${status}`],
    notebookRefs: [
      { refType: "notebook", refId: syntheticLearnerEvalTracerBulletFixture.seededNotebookId },
    ],
    scenarioRuns: [
      {
        ...matrix.runs[0]!,
        id: `slrun_dashboard_${status}_0`,
        runId: `slrun_dashboard_${status}`,
        fixtureVersion: matrix.fixture.version,
        status,
        startedAt: "2026-05-22T00:00:00.000Z",
        completedAt: "2026-05-22T00:00:30.000Z",
        durationMs: 30000,
        steps: [],
        assertions: [
          {
            id: "learner_visible_no_id_leak",
            category: "learner_visible",
            description: "Tutor text does not leak raw IDs.",
            status,
            passed: status === "passed",
            failureMessage:
              status === "failed"
                ? "Tutor text leaks machine-generated content: [object Object]"
                : undefined,
            evidenceRefs: [],
            details: {},
          },
        ],
        artifactRefs: [],
        screenshotRefs: [{ refType: "screenshot", refId: `screenshot_${status}` }],
        traceRefs: [],
        notebookRefs: [{ refType: "notebook", refId: `nb_${status}` }],
        evalEvidenceSnapshots: [],
        runKind: status === "passed" ? "golden_journey" : "regression",
        learnerMode: status === "passed" ? "scripted" : "scenario_autonomous_llm",
        gatingPolicy: status === "passed" ? "ci_gating" : "non_ci_gating",
        issueCandidates:
          status === "failed"
            ? [
                {
                  title: "Synthetic Learner found a dashboard-rendered failure",
                  kind: "failure",
                  reason: "run_failed",
                  severity: "medium",
                  learnerMode: "scenario_autonomous_llm",
                  runKind: "regression",
                  personaId: syntheticLearnerEvalTracerBulletPersonas[0]!.id,
                  scenarioId: syntheticLearnerEvalTracerBulletScenarios[0]!.id,
                  fixtureManifestId: matrix.fixture.id,
                  fixtureVersion: matrix.fixture.version,
                  seededNotebookId: `nb_${status}`,
                  failureSummary: "Tutor text leaks machine-generated content.",
                  transcriptExcerpt: ["FINAL: failed"],
                  evidenceRefs: [],
                  traceRefs: [],
                  artifactRefs: [],
                  reproductionCommand:
                    "pnpm --filter @studyagent/worker synthetic-learner-evals -- --learner-mode=scenario_autonomous_llm",
                  publishEligible: true,
                },
                {
                  title: "Synthetic Learner repaired invalid action",
                  kind: "warning",
                  reason: "invalid_action_repaired",
                  severity: "low",
                  learnerMode: "scenario_autonomous_llm",
                  runKind: "regression",
                  personaId: syntheticLearnerEvalTracerBulletPersonas[0]!.id,
                  scenarioId: syntheticLearnerEvalTracerBulletScenarios[0]!.id,
                  fixtureManifestId: matrix.fixture.id,
                  fixtureVersion: matrix.fixture.version,
                  seededNotebookId: `nb_${status}`,
                  failureSummary:
                    "The Synthetic Learner produced an invalid action that was repaired.",
                  transcriptExcerpt: ["SIMULATOR ACTION repaired"],
                  evidenceRefs: [],
                  traceRefs: [],
                  artifactRefs: [],
                  reproductionCommand:
                    "pnpm --filter @studyagent/worker synthetic-learner-evals -- --learner-mode=scenario_autonomous_llm",
                  publishEligible: true,
                },
              ]
            : [],
        rubricResults: [
          {
            rubricId: "rubric_tutoring_quality",
            qualitative: true,
            enabled: true,
            status: "skipped",
            score: null,
            dimensionScores: {},
            summary: "Qualitative rubric was not run.",
            evidenceRefs: [],
          },
        ],
        finalState: {
          passed: status === "passed",
          summary: status === "passed" ? "Scenario passed." : "Scenario failed.",
        },
      },
    ],
  });
}

function summarizeRun(runRecord: ReturnType<typeof buildRunRecord>) {
  return {
    id: runRecord.id,
    status: runRecord.status,
    startedAt: runRecord.startedAt,
    completedAt: runRecord.completedAt,
    durationMs: runRecord.durationMs,
    fixtureManifestId: runRecord.fixtureManifestId,
    fixtureVersion: runRecord.fixtureVersion,
    notebookId: runRecord.notebookRefs[0]?.refId ?? runRecord.seededNotebookId,
    scenarioRunCount: runRecord.scenarioRuns.length,
    passedScenarioCount: runRecord.scenarioRuns.filter(
      (scenarioRun) => scenarioRun.status === "passed",
    ).length,
    failedScenarioCount: runRecord.scenarioRuns.filter(
      (scenarioRun) => scenarioRun.status === "failed",
    ).length,
    personaIds: runRecord.scenarioRuns.map((scenarioRun) => scenarioRun.personaId),
    scenarioIds: runRecord.scenarioRuns.map((scenarioRun) => scenarioRun.scenarioId),
    notebookRefs: runRecord.notebookRefs,
    transcriptLineCount: runRecord.transcript.length,
    updatedAt: runRecord.completedAt ?? runRecord.startedAt,
  };
}

describe("EvalRunsDashboard", () => {
  it("renders a passing eval run", () => {
    const html = renderDashboard(buildRunRecord("passed"));
    expect(html).toContain("Synthetic Learner Eval Runs");
    expect(html).toContain("slrun_dashboard_passed");
    expect(html).toContain("passed");
    expect(html).toContain("Transcript");
    expect(html).toContain("Qualitative rubrics");
    expect(html).toContain("Screenshots");
    expect(html).toContain("Live observation");
    expect(html).toContain("Evidence snapshots");
    expect(html).toContain("FINAL: passed");
  });

  it("renders active observation events for a running eval run", () => {
    const runRecord = buildRunRecord("passed");
    runRecord.status = "running";
    runRecord.completedAt = undefined;
    runRecord.observationEvents = [
      {
        id: "obs_running_1",
        runId: runRecord.id,
        timestamp: "2026-05-22T00:00:01.000Z",
        kind: "run",
        status: "running",
        message: "Eval Run is still executing.",
        payload: {},
        evidenceRefs: [],
      },
      {
        id: "obs_running_2",
        runId: runRecord.id,
        timestamp: "2026-05-22T00:00:02.000Z",
        kind: "student",
        message: "Teach me the topic.",
        payload: {},
        evidenceRefs: [],
      },
    ];
    runRecord.scenarioRuns[0]!.evalEvidenceSnapshotRefs = [
      { refType: "eval_evidence_snapshot", refId: "snap_running_1" },
    ];

    const html = renderDashboard(runRecord);
    expect(html).toContain("running");
    expect(html).toContain("Eval Run is still executing.");
    expect(html).toContain("Teach me the topic.");
    expect(html).toContain("eval_evidence_snapshot:snap_running_1");
  });

  it("renders eval plans and snapshot categories for a run", () => {
    const runRecord = buildRunRecord("passed");
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
      scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
    });
    runRecord.evalPlans = [
      planSyntheticLearnerEvalRun({
        scenario: { ...matrix.scenarios[0]!, runKind: "scenario_autonomous" },
        persona: matrix.personas[0]!,
        learnerMode: "scenario_autonomous_llm",
      }),
    ];
    runRecord.evalEvidenceSnapshots = [
      {
        id: "snap_dashboard_1",
        notebookId: matrix.fixture.seededNotebookId,
        capturedAt: "2026-05-22T00:01:00.000Z",
        snapshotRefs: [{ refType: "eval_evidence_snapshot", refId: "snap_dashboard_1" }],
        categories: [
          {
            category: "mastery_evidence",
            status: "available",
            required: true,
            refs: [{ refType: "turn", refId: "turn_dashboard_1" }],
          },
        ],
      },
    ];
    runRecord.scenarioRuns[0]!.evalEvidenceSnapshotRefs = [
      { refType: "eval_evidence_snapshot", refId: "snap_dashboard_1" },
    ];

    const html = renderDashboard(runRecord);
    expect(html).toContain("Eval plans");
    expect(html).toContain("scenario_autonomous_llm");
    expect(html).toContain("mastery_evidence");
    expect(html).toContain("eval_evidence_snapshot:snap_dashboard_1");
  });

  it("renders a failing eval run with scenario matrix detail", () => {
    const html = renderDashboard(buildRunRecord("failed"));
    expect(html).toContain("slrun_dashboard_failed");
    expect(html).toContain("failed");
    expect(html).toContain("Scenario matrix");
    expect(html).toContain("Issue candidates");
    expect(html).toContain("Failures");
    expect(html).toContain("Warnings");
    expect(html).toContain("Synthetic Learner found a dashboard-rendered failure");
    expect(html).toContain("Synthetic Learner repaired invalid action");
    expect(html).toContain("Tutor text leaks machine-generated content");
  });
});
