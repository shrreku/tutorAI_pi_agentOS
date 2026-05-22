import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import EvalRunsDashboard from "./EvalRunsDashboard.js";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
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
  client.setQueryData(["eval-runs"], { runs: [{ summary: summarizeRun(runRecord), run: runRecord }] });
  client.setQueryData(["eval-run", runRecord.id], { summary: summarizeRun(runRecord), run: runRecord });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <EvalRunsDashboard selectedRunId={runRecord.id} onSelectRun={() => {}} onBackToNotebooks={() => {}} />
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
    notebookRefs: [{ refType: "notebook", refId: syntheticLearnerEvalTracerBulletFixture.seededNotebookId }],
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
            failureMessage: status === "failed" ? "Tutor text leaks machine-generated content: [object Object]" : undefined,
            evidenceRefs: [],
            details: {},
          },
        ],
        artifactRefs: [],
        traceRefs: [],
        notebookRefs: [{ refType: "notebook", refId: `nb_${status}` }],
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
    passedScenarioCount: runRecord.scenarioRuns.filter((scenarioRun) => scenarioRun.status === "passed").length,
    failedScenarioCount: runRecord.scenarioRuns.filter((scenarioRun) => scenarioRun.status === "failed").length,
    personaIds: runRecord.scenarioRuns.map((scenarioRun) => scenarioRun.personaId),
    scenarioIds: runRecord.scenarioRuns.map((scenarioRun) => scenarioRun.scenarioId),
    notebookRefs: runRecord.notebookRefs,
    transcriptLineCount: runRecord.transcript.length,
  };
}

describe("EvalRunsDashboard", () => {
  it("renders a passing eval run", () => {
    const html = renderDashboard(buildRunRecord("passed"));
    expect(html).toContain("Synthetic Learner Eval Runs");
    expect(html).toContain("slrun_dashboard_passed");
    expect(html).toContain("passed");
    expect(html).toContain("Transcript");
    expect(html).toContain("FINAL: passed");
  });

  it("renders a failing eval run with scenario matrix detail", () => {
    const html = renderDashboard(buildRunRecord("failed"));
    expect(html).toContain("slrun_dashboard_failed");
    expect(html).toContain("failed");
    expect(html).toContain("Scenario matrix");
    expect(html).toContain("Tutor text leaks machine-generated content");
  });
});
