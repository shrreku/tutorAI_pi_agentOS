import { describe, expect, it } from "vitest";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
  evalSourceFixtureManifestSchema,
  syntheticLearnerAssertionSchema,
  syntheticLearnerEvalMatrixSchema,
  syntheticLearnerEvalScenarioRunSchema,
  formatSyntheticLearnerList,
  syntheticLearnerPersonaSchema,
  syntheticLearnerScenarioSchema,
  renderSyntheticLearnerLivePrompt,
  renderSyntheticLearnerScriptedMessages,
  exportSyntheticLearnerEvalRunReport,
} from "./synthetic-learner-evals.js";
import { evaluateSyntheticLearnerAssertions } from "./synthetic-learner-evals.assertions.js";
import {
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalTracerBulletScenarios,
} from "./synthetic-learner-evals.fixtures.js";
import {
  assessTracerBulletSyntheticLearnerEvalFixtureFreshness,
  loadTracerBulletSyntheticLearnerEvalMatrix,
} from "./synthetic-learner-evals.runner.js";

describe("synthetic learner eval contracts", () => {
  it("validates the first tracer bullet fixture manifest", () => {
    const parsed = evalSourceFixtureManifestSchema.parse(syntheticLearnerEvalTracerBulletFixture);
    expect(parsed.learnerAnalyticsScope).toBe("eval_only");
    expect(parsed.compatible).toBe(true);
    expect(parsed.compatibilityStatus).toBe("compatible");
    expect(parsed.generationMetadata.pipelineVersion).toBe(parsed.ingestionPipelineVersion);
    expect(parsed.generationMetadata.ingestionPipelineHash).toBe(parsed.ingestionPipelineHash);
    expect(parsed.ingestionPipelineHash).toMatch(/^sha256:/);
    expect(parsed.readinessChecks.every((check) => check.passed)).toBe(true);
    expect(parsed.expectedTopics).toContain("derivatives");
    expect(parsed.expectedConcepts).toContain("Derivative");
    expect(parsed.expectedCitations).toHaveLength(1);
    expect(Object.keys(parsed.tutoringReadyState)).toContain("notebook");
    expect(assessTracerBulletSyntheticLearnerEvalFixtureFreshness(parsed).isFresh).toBe(true);
  });

  it("validates the tracer bullet persona and scenario fixtures", () => {
    expect(syntheticLearnerPersonaSchema.array().parse(syntheticLearnerEvalTracerBulletPersonas)).toHaveLength(3);
    expect(syntheticLearnerScenarioSchema.array().parse(syntheticLearnerEvalTracerBulletScenarios)).toHaveLength(3);
  });

  it("rejects malformed persona and scenario fixtures", () => {
    const invalidPersona = {
      ...syntheticLearnerEvalTracerBulletPersonas[0],
      studyHabits: [],
    };
    const invalidScenario = {
      ...syntheticLearnerEvalTracerBulletScenarios[0],
      beats: [],
    };

    expect(syntheticLearnerPersonaSchema.safeParse(invalidPersona).success).toBe(false);
    expect(syntheticLearnerScenarioSchema.safeParse(invalidScenario).success).toBe(false);
  });

  it("renders scripted learner messages and live prompts with scenario constraints", () => {
    const persona = syntheticLearnerEvalTracerBulletPersonas[0]!;
    const scenario = syntheticLearnerEvalTracerBulletScenarios[0]!;

    expect(renderSyntheticLearnerScriptedMessages(scenario)).toEqual(
      scenario.beats.map((beat) => beat.scriptedMessage),
    );

    const prompt = renderSyntheticLearnerLivePrompt({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      persona,
      scenario,
    });

    expect(prompt).toContain(`Source fixture: ${scenario.sourceFixtureId}`);
    expect(prompt).toContain(`Max turns: ${scenario.maxTurns}`);
    expect(prompt).toContain(`Allowed actions: ${scenario.allowedActions.join(", ")}`);
    expect(prompt).toContain(`Stop conditions: ${scenario.stopConditions.join(", ")}`);
    expect(prompt).toContain(`Assertion refs: ${scenario.assertionRefs.map((ref) => ref.refId).join(", ")}`);
    expect(prompt).toContain(`constraints=${formatSyntheticLearnerList(persona.responsePolicy.constraints, "; ")}`);
    expect(prompt).toContain("Beats:");
    expect(prompt).toContain(scenario.beats[0]?.liveInstruction ?? "");
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

  it("warns, fails, and regenerates stale tracer bullet fixtures by mode", () => {
    const staleFixture = {
      ...syntheticLearnerEvalTracerBulletFixture,
      sourceContentHash: "sha256:stale-source-content-hash",
      ingestionPipelineVersion: "ingestion@2025.12.01",
      generationMetadata: {
        ...syntheticLearnerEvalTracerBulletFixture.generationMetadata,
        pipelineVersion: "ingestion@2025.12.01",
      },
    };
    const warnings: string[] = [];

    const warnedMatrix = loadTracerBulletSyntheticLearnerEvalMatrix({
      fixture: staleFixture,
      freshnessMode: "warn",
      onStatus: (message) => warnings.push(message),
    });
    expect(warnings.some((message) => message.includes("stale"))).toBe(true);
    expect(warnedMatrix.fixture.sourceContentHash).toBe(staleFixture.sourceContentHash);

    expect(() =>
      loadTracerBulletSyntheticLearnerEvalMatrix({
        fixture: staleFixture,
        freshnessMode: "strict",
      }),
    ).toThrow(/stale/);

    const regeneratedMatrix = loadTracerBulletSyntheticLearnerEvalMatrix({
      fixture: staleFixture,
      freshnessMode: "regenerate",
      generatedAt: "2026-05-22T00:30:00.000Z",
      onStatus: (message) => warnings.push(message),
    });
    expect(warnings.some((message) => message.startsWith("REGENERATED:"))).toBe(true);
    expect(regeneratedMatrix.fixture.sourceContentHash).toBe(syntheticLearnerEvalTracerBulletFixture.sourceContentHash);
    expect(regeneratedMatrix.fixture.ingestionPipelineVersion).toBe(
      syntheticLearnerEvalTracerBulletFixture.ingestionPipelineVersion,
    );
    expect(regeneratedMatrix.fixture.generatedAt).toBe("2026-05-22T00:30:00.000Z");
    expect(regeneratedMatrix.fixture.generationMetadata.generatedAt).toBe("2026-05-22T00:30:00.000Z");
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

  it("evaluates learner-visible, runtime, and persistence assertions deterministically", () => {
    const assertions = evaluateSyntheticLearnerAssertions({
      assertionRefs: [
        { refType: "assertion", refId: "learner_visible_no_id_leak" },
        { refType: "assertion", refId: "learner_visible_source_refs" },
        { refType: "assertion", refId: "runtime_mastery_evidence" },
        { refType: "assertion", refId: "persistence_conservative_movement" },
        { refType: "assertion", refId: "persistence_artifact_status" },
        { refType: "assertion", refId: "persistence_crystallization_boundary" },
      ],
      transcript: ["RUN STARTED: slrun_1", "TUTOR: We can review the derivative definition."],
      tutorMessages: ["We can review the derivative definition."],
      toolEvents: [
        {
          label: "started",
          toolName: "notebook.search",
          nodeRefs: [{ refType: "tool_call", refId: "tool_call_1" }],
        },
      ],
      runtimeEvents: [
        {
          eventType: "learning.evaluate_response",
          payload: { status: "pending" },
          timestamp: "2026-05-22T00:04:30.000Z",
        },
      ],
      notebookEvents: [
        {
          eventType: "session.context.selected",
          payload: { sessionId: "sess_1" },
          timestamp: "2026-05-22T00:04:31.000Z",
        },
      ],
      traceRefs: [
        { refType: "session", refId: "sess_1" },
        { refType: "source", refId: "src_1" },
      ],
      notebookRefs: [{ refType: "notebook", refId: "nb_1" }],
      persistence: {
        masteryEvidence: [
          {
            ref: { refType: "turn", refId: "turn_1" },
            correctnessLabel: "partial",
            overallScore: 0.55,
            confidence: 0.62,
          },
        ],
        artifacts: [{ ref: { refType: "artifact", refId: "artifact_1" }, status: "ready" }],
        sessionEvents: [
          {
            ref: { refType: "session", refId: "sess_1" },
            eventType: "session.completed",
            timestamp: "2026-05-22T00:05:00.000Z",
          },
          {
            ref: { refType: "session", refId: "sess_1" },
            eventType: "session.digest.created",
            timestamp: "2026-05-22T00:05:01.000Z",
          },
        ],
      },
    });

    expect(assertions.map((assertion) => assertion.status)).toEqual(["passed", "passed", "passed", "passed", "passed", "passed"]);
    expect(assertions[0]?.evidenceRefs).toEqual(expect.arrayContaining([{ refType: "session", refId: "sess_1" }]));
    expect(syntheticLearnerAssertionSchema.parse(assertions[1]!).passed).toBe(true);
  });

  it("fails learner-visible assertions for raw IDs and skips persistence assertions without evidence", () => {
    const learnerVisible = evaluateSyntheticLearnerAssertions({
      assertionRefs: [{ refType: "assertion", refId: "learner_visible_no_id_leak" }],
      tutorMessages: ["The answer lives in turn_1 and [object Object]."],
      traceRefs: [{ refType: "turn", refId: "turn_1" }],
    });
    expect(learnerVisible[0]?.status).toBe("failed");
    expect(learnerVisible[0]?.failureMessage).toContain("[object Object]");

    const skipped = evaluateSyntheticLearnerAssertions({
      assertionRefs: [{ refType: "assertion", refId: "persistence_artifact_status" }],
      tutorMessages: ["We can keep going."],
      runtimeEvents: [
        {
          eventType: "learning.evaluate_response",
          payload: { status: "pending" },
          timestamp: "2026-05-22T00:04:30.000Z",
        },
      ],
    });
    expect(skipped[0]?.status).toBe("skipped");
    expect(skipped[0]?.failureMessage).toContain("No persisted evidence snapshot was provided");
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
