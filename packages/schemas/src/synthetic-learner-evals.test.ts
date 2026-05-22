import { describe, expect, it } from "vitest";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
  evalSourceFixtureManifestSchema,
  syntheticLearnerAssertionSchema,
  syntheticLearnerEvalMatrixSchema,
  syntheticLearnerEvalScenarioRunSchema,
  exportSyntheticLearnerEvalRunReport,
} from "./synthetic-learner-evals.js";
import {
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalTracerBulletScenarios,
} from "./synthetic-learner-evals.fixtures.js";

describe("synthetic learner eval contracts", () => {
  it("validates the first tracer bullet fixture manifest", () => {
    const parsed = evalSourceFixtureManifestSchema.parse(syntheticLearnerEvalTracerBulletFixture);
    expect(parsed.learnerAnalyticsScope).toBe("eval_only");
    expect(parsed.compatible).toBe(true);
    expect(parsed.compatibilityStatus).toBe("compatible");
    expect(parsed.generationMetadata.pipelineVersion).toBe(parsed.ingestionPipelineVersion);
    expect(parsed.readinessChecks.every((check) => check.passed)).toBe(true);
    expect(parsed.expectedTopics).toContain("derivatives");
    expect(parsed.expectedConcepts).toContain("Derivative");
    expect(parsed.expectedCitations).toHaveLength(1);
    expect(Object.keys(parsed.tutoringReadyState)).toContain("notebook");
  });

  it("expands the 1 x 3 x 3 tracer bullet into nine planned runs", () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas,
      scenarios: syntheticLearnerEvalTracerBulletScenarios,
    });

    expect(matrix.runs).toHaveLength(9);
    expect(matrix.runs[0]).toMatchObject({
      fixtureManifestId: syntheticLearnerEvalTracerBulletFixture.id,
      seededNotebookId: syntheticLearnerEvalTracerBulletFixture.seededNotebookId,
      status: "planned",
    });
    expect(
      new Set(matrix.runs.map((run) => `${run.personaId}:${run.scenarioId}`)),
    ).toHaveLength(9);
  });

  it("validates persisted run records with learner-visible assertions", () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
      scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
    });

    const run = {
      ...matrix.runs[0]!,
      status: "passed" as const,
      completedAt: "2026-05-22T00:05:00.000Z",
      durationMs: 300,
      studentMessages: ["Teach me the topic."],
      tutorMessages: ["Let's work through a checkpoint."],
      toolEvents: [
        {
          label: "fetch_context",
          toolName: "notebook.search",
          nodeRefs: [{ refType: "source", refId: "src_1" }],
        },
      ],
      runtimeEvents: [
        {
          eventType: "learning.evaluate_response",
          payload: { label: "partial" },
          timestamp: "2026-05-22T00:04:30.000Z",
        },
      ],
      assertions: [
        {
          id: "assert_1",
          category: "learner_visible",
          description: "Tutor text does not leak raw IDs.",
          passed: true,
          evidenceRefs: [{ refType: "turn", refId: "turn_1" }],
          details: { checkedFragments: 2 },
        },
      ],
      artifactRefs: [{ refType: "artifact", refId: "artifact_1" }],
      traceRefs: [{ refType: "session", refId: "sess_1" }],
      finalState: { passed: true, summary: "Scenario completed cleanly." },
    };

    const parsed = syntheticLearnerEvalMatrixSchema.parse({
      ...matrix,
      runs: [run],
    });

    expect(parsed.runs[0]?.assertions[0]?.category).toBe("learner_visible");
    expect(syntheticLearnerAssertionSchema.parse(run.assertions[0]!).passed).toBe(true);
  });

  it("builds and exports completed eval runs separately from notebook state", () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 2),
      scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 2),
    });

    const scenarioRuns = matrix.runs.slice(0, 2).map((run, index) =>
      syntheticLearnerEvalScenarioRunSchema.parse({
        ...run,
        runId: "slrun_traceable_eval_run",
        fixtureVersion: matrix.fixture.version,
        status: index === 0 ? "passed" : "failed",
        startedAt: index === 0 ? "2026-05-22T00:00:00.000Z" : "2026-05-22T00:10:00.000Z",
        completedAt: index === 0 ? "2026-05-22T00:05:00.000Z" : "2026-05-22T00:14:00.000Z",
        durationMs: index === 0 ? 300000 : 240000,
        steps: [
          {
            id: `step_${index + 1}_1`,
            stepIndex: 0,
            kind: "prompt",
            status: index === 0 ? "passed" : "failed",
            startedAt: index === 0 ? "2026-05-22T00:00:00.000Z" : "2026-05-22T00:10:00.000Z",
            completedAt: index === 0 ? "2026-05-22T00:01:00.000Z" : "2026-05-22T00:11:00.000Z",
            durationMs: 60000,
            studentMessage: "Teach me the topic.",
            tutorMessage: "Let's work through it.",
            toolEvents: [],
            runtimeEvents: [],
            assertions: [
              {
                id: `assert_${index + 1}_1`,
                category: "learner_visible",
                description: "Tutor text stays readable.",
                passed: index === 0,
                evidenceRefs: [{ refType: "turn", refId: `turn_${index + 1}` }],
                details: {},
              },
            ],
            artifactRefs: [{ refType: "artifact", refId: `artifact_${index + 1}` }],
            traceRefs: [{ refType: "session", refId: `trace_${index + 1}` }],
            details: { step: "first_prompt" },
          },
        ],
        assertions: [
          {
            id: `assert_${index + 1}_1`,
            category: "learner_visible",
            description: "Tutor text stays readable.",
            passed: index === 0,
            evidenceRefs: [{ refType: "turn", refId: `turn_${index + 1}` }],
            details: {},
          },
        ],
        artifactRefs: [{ refType: "artifact", refId: `artifact_${index + 1}` }],
        traceRefs: [{ refType: "session", refId: `trace_${index + 1}` }],
        notebookRefs: [{ refType: "notebook", refId: matrix.fixture.seededNotebookId }],
        finalState: {
          passed: index === 0,
          summary: index === 0 ? "Scenario passed." : "Scenario failed.",
        },
      }),
    );

    const runRecord = buildSyntheticLearnerEvalRunRecord({
      matrix,
      scenarioRuns,
      runId: "slrun_traceable_eval_run",
      completedAt: "2026-05-22T00:14:00.000Z",
      artifactPath: "eval-runs/slrun_traceable_eval_run.json",
      generatedAt: "2026-05-22T00:15:00.000Z",
    });

    expect(runRecord.status).toBe("failed");
    expect(runRecord.notebookRefs).toEqual([
      { refType: "notebook", refId: syntheticLearnerEvalTracerBulletFixture.seededNotebookId },
    ]);
    expect(runRecord.scenarioRuns).toHaveLength(2);
    expect(runRecord.scenarioRuns[0]?.steps).toHaveLength(1);
    expect(runRecord.scenarioRuns[1]?.status).toBe("failed");

    const exportJson = exportSyntheticLearnerEvalRunReport({
      run: runRecord,
      format: "json",
      artifactPath: "eval-runs/slrun_traceable_eval_run.json",
      generatedAt: "2026-05-22T00:15:00.000Z",
    });

    const parsedJson = JSON.parse(exportJson.reportContent) as {
      metadata: { format: string; artifactPath: string };
      run: { status: string; reportMetadata: Array<{ artifactPath: string }>; scenarioRuns: unknown[] };
    };
    expect(parsedJson.metadata.format).toBe("json");
    expect(parsedJson.metadata.artifactPath).toBe("eval-runs/slrun_traceable_eval_run.json");
    expect(parsedJson.run.status).toBe("failed");
    expect(parsedJson.run.reportMetadata).toHaveLength(1);
    expect(parsedJson.run.scenarioRuns).toHaveLength(2);

    const exportNdjson = exportSyntheticLearnerEvalRunReport({
      run: runRecord,
      format: "ndjson",
      artifactPath: "eval-runs/slrun_traceable_eval_run.ndjson",
      generatedAt: "2026-05-22T00:15:00.000Z",
    });

    expect(exportNdjson.reportContent.split("\n")).toHaveLength(4);
    expect(exportNdjson.reportMetadata).toHaveLength(1);
    expect(exportNdjson.reportMetadata[0]?.format).toBe("ndjson");
  });
});
