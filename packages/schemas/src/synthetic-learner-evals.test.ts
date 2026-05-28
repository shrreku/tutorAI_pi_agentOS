import { describe, expect, it } from "vitest";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
  buildSkippedSyntheticLearnerRubricResults,
  deriveDeterministicGateStatus,
  evaluateEvalSourceFixtureFreshness,
  evalSourceFixtureManifestSchema,
  syntheticLearnerAssertionSchema,
  syntheticLearnerEvalMatrixSchema,
  syntheticLearnerEvalScenarioRunSchema,
  formatSyntheticLearnerList,
  regenerateEvalSourceFixtureManifest,
  syntheticLearnerPersonaSchema,
  syntheticLearnerScenarioSchema,
  syntheticLearnerActionDecisionSchema,
  syntheticLearnerEvalIssueCandidateSchema,
  syntheticLearnerModelConfigSchema,
  renderSyntheticLearnerLivePrompt,
  renderSyntheticLearnerScriptedMessages,
  exportSyntheticLearnerEvalRunReport,
} from "./synthetic-learner-evals.js";
import { evaluateSyntheticLearnerAssertions } from "./synthetic-learner-evals.assertions.js";
import {
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalAutonomousDiscoveryScenario,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalRubrics,
  syntheticLearnerEvalTracerBulletScenarios,
  syntheticLearnerTraitEstimationScenarios,
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

  it("detects fresh and stale eval source fixtures by mode", () => {
    const fresh = evaluateEvalSourceFixtureFreshness({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      mode: "strict",
    });
    expect(fresh.status).toBe("fresh");
    expect(fresh.importable).toBe(true);
    expect(fresh.reasons).toEqual([]);

    const staleFixture = {
      ...syntheticLearnerEvalTracerBulletFixture,
      ingestionPipelineVersion: "ingestion@old",
      generationMetadata: {
        ...syntheticLearnerEvalTracerBulletFixture.generationMetadata,
        pipelineVersion: "ingestion@old",
      },
    };

    const warning = evaluateEvalSourceFixtureFreshness({
      fixture: staleFixture,
      mode: "warn",
    });
    expect(warning.status).toBe("stale_warning");
    expect(warning.importable).toBe(true);
    expect(warning.reasons.join("\n")).toContain("ingestion pipeline version");

    const strict = evaluateEvalSourceFixtureFreshness({
      fixture: staleFixture,
      mode: "strict",
    });
    expect(strict.status).toBe("stale_failure");
    expect(strict.importable).toBe(false);
  });

  it("regenerates fixture metadata explicitly without learner-specific state", () => {
    const staleFixture = {
      ...syntheticLearnerEvalTracerBulletFixture,
      schemaVersion: "synthetic-learner-evals@old",
      generationMetadata: {
        ...syntheticLearnerEvalTracerBulletFixture.generationMetadata,
        schemaVersion: "synthetic-learner-evals@old",
      },
      generatedAt: "2026-05-20T00:00:00.000Z",
    };

    const regenerated = regenerateEvalSourceFixtureManifest({
      fixture: staleFixture,
      generatedAt: "2026-05-23T00:00:00.000Z",
      notes: "Regenerated in test.",
    });

    expect(regenerated.schemaVersion).toBe("synthetic-learner-evals@1");
    expect(regenerated.generationMetadata.schemaVersion).toBe("synthetic-learner-evals@1");
    expect(regenerated.generatedAt).toBe("2026-05-23T00:00:00.000Z");
    expect(regenerated.compatibilityStatus).toBe("compatible");
    expect(regenerated.learnerAnalyticsScope).toBe("eval_only");
    expect(regenerated.tutoringReadyState).toEqual(syntheticLearnerEvalTracerBulletFixture.tutoringReadyState);

    const freshness = evaluateEvalSourceFixtureFreshness({
      fixture: regenerated,
      mode: "regenerate",
    });
    expect(freshness.status).toBe("fresh");
    expect(freshness.importable).toBe(true);
  });

  it("validates the tracer bullet persona and scenario fixtures", () => {
    expect(syntheticLearnerPersonaSchema.array().parse(syntheticLearnerEvalTracerBulletPersonas)).toHaveLength(3);
    expect(syntheticLearnerScenarioSchema.array().parse(syntheticLearnerEvalTracerBulletScenarios)).toHaveLength(3);
    expect(syntheticLearnerEvalTracerBulletScenarios[1]?.browserSteps).toHaveLength(2);
    expect(syntheticLearnerScenarioSchema.parse(syntheticLearnerEvalAutonomousDiscoveryScenario).runKind).toBe("full_autonomous");
    expect(syntheticLearnerEvalAutonomousDiscoveryScenario.autonomousConfig?.durableWritesScope).toBe("eval_owned_notebooks");
  });

  it("validates trait-estimation scenarios", () => {
    const parsed = syntheticLearnerScenarioSchema.array().parse(syntheticLearnerTraitEstimationScenarios);

    expect(parsed).toHaveLength(5);
    expect(parsed.map((scenario) => scenario.id)).toEqual([
      "scenario_trait_explicit_preference_change",
      "scenario_trait_overconfident_contradiction",
      "scenario_trait_help_avoidant_stuck",
      "scenario_trait_exam_urgency",
      "scenario_trait_low_confidence_high_mastery",
    ]);
    for (const scenario of parsed) {
      expect(scenario.assertionRefs.map((ref) => ref.refId)).toEqual(expect.arrayContaining([
        "runtime_trait_estimation",
        "persistence_trait_estimates",
        "persistence_trait_recommendation_only",
      ]));
    }
  });

  it("validates layered learner modes, simulator config, and action decisions", () => {
    const parsedConfig = syntheticLearnerModelConfigSchema.parse({
      provider: "openai_compatible",
      model: "synthetic-student",
      baseUrl: "https://models.example.test/v1",
      temperature: 0.4,
      maxActionRepairAttempts: 3,
    });
    expect(parsedConfig.model).toBe("synthetic-student");

    const parsedAction = syntheticLearnerActionDecisionSchema.parse({
      action: "artifact.view",
      rationale: "The learner wants to inspect the generated quiz before answering.",
      artifactId: "artifact_quiz_1",
    });
    expect(parsedAction.action).toBe("artifact.view");

    const scenarioRun = syntheticLearnerEvalScenarioRunSchema.parse({
      ...buildSyntheticLearnerEvalMatrix({
        fixture: syntheticLearnerEvalTracerBulletFixture,
        personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
        scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
      }).runs[0]!,
      id: "slrun_layered_modes_0",
      runId: "slrun_layered_modes",
      fixtureVersion: syntheticLearnerEvalTracerBulletFixture.version,
      status: "passed",
      completedAt: "2026-05-24T00:05:00.000Z",
      steps: [],
      assertions: [],
      artifactRefs: [],
      screenshotRefs: [],
      traceRefs: [],
      notebookRefs: [{ refType: "notebook", refId: "nb_layered_modes" }],
      runKind: "golden_journey",
      learnerMode: "beat_llm",
      simulatorModel: parsedConfig,
      gatingPolicy: "non_ci_gating",
      actionRepairAttempts: 1,
      rubricResults: [],
      finalState: { passed: true, summary: "Scenario passed." },
    });

    expect(scenarioRun.runKind).toBe("golden_journey");
    expect(scenarioRun.learnerMode).toBe("beat_llm");
    expect(scenarioRun.gatingPolicy).toBe("non_ci_gating");
  });

  it("normalizes model-shaped Synthetic Learner actions into the strict action contract", () => {
    expect(syntheticLearnerActionDecisionSchema.parse({
      action: "request_artifact",
      parameters: { query: "Please make me a source-grounded quiz for exam prep." },
    })).toMatchObject({
      action: "chat.respond",
      learnerMessage: "Please make me a source-grounded quiz for exam prep.",
    });

    expect(syntheticLearnerActionDecisionSchema.parse({
      action: "artifact.list",
      parameters: {},
    })).toMatchObject({
      action: "artifact.list",
      rationale: "Synthetic Learner selected artifact.list.",
    });
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

  it("evaluates trait-estimation assertions as recommendation-only persistence", () => {
    const assertions = evaluateSyntheticLearnerAssertions({
      assertionRefs: [
        { refType: "assertion", refId: "runtime_trait_estimation" },
        { refType: "assertion", refId: "persistence_trait_estimates" },
        { refType: "assertion", refId: "persistence_trait_recommendation_only" },
        { refType: "assertion", refId: "persistence_trait_no_mastery_mutation" },
      ],
      runtimeEvents: [
        {
          eventType: "learner_trait.signal.recorded",
          payload: { signalId: "lts_1" },
          timestamp: "2026-05-25T08:00:00.000Z",
        },
      ],
      persistence: {
        sessionEvents: [
          {
            ref: { refType: "trait_signal", refId: "lts_1" },
            eventType: "learner_trait.signal.recorded",
            timestamp: "2026-05-25T08:00:00.000Z",
          },
          {
            ref: { refType: "trait_guardrail_decision", refId: "ltgd_1" },
            eventType: "learner_trait.guardrail_decision.recorded",
            timestamp: "2026-05-25T08:00:05.000Z",
          },
        ],
      },
    });

    expect(assertions.map((assertion) => assertion.status)).toEqual(["passed", "passed", "passed", "passed"]);
  });

  it("fails learner-visible assertions for raw IDs and required persistence assertions without evidence", () => {
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
    expect(skipped[0]?.status).toBe("failed");
    expect(skipped[0]?.failureMessage).toContain("Required persisted evidence snapshot was unavailable");
    expect(skipped[0]?.details.reason).toBe("unavailable_required_snapshot");
  });

  it("keeps explicitly optional persistence assertions skippable when snapshots are unavailable", () => {
    const assertions = evaluateSyntheticLearnerAssertions({
      assertionRefs: [{ refType: "assertion", refId: "persistence_artifact_status", required: false }],
      tutorMessages: ["We can keep going."],
    });

    expect(assertions[0]?.status).toBe("skipped");
    expect(assertions[0]?.failureMessage).toContain("Optional persisted evidence snapshot was unavailable");
    expect(assertions[0]?.details.reason).toBe("skipped_optional_snapshot");
  });

  it("uses persisted mastery evidence exposed by runtime trace events for persistence assertions", () => {
    const assertions = evaluateSyntheticLearnerAssertions({
      assertionRefs: [{ refType: "assertion", refId: "persistence_conservative_movement" }],
      runtimeEvents: [
        {
          eventType: "mastery.evidence.recorded",
          payload: {
            masteryEvidenceId: "mev_trace_1",
            evidence: {
              id: "mev_trace_1",
              turnId: "turn_trace_1",
              correctnessLabel: "partial",
              overallScore: 0.5,
              confidence: 0.55,
              triggerSource: "runtime_auto",
            },
          },
          timestamp: "2026-05-22T00:04:30.000Z",
        },
      ],
    });

    expect(assertions[0]?.status).toBe("passed");
    expect(assertions[0]?.evidenceRefs).toEqual(expect.arrayContaining([{ refType: "turn", refId: "turn_trace_1" }]));
  });

  it("uses compact mastery evidence event payloads for persistence assertions", () => {
    const assertions = evaluateSyntheticLearnerAssertions({
      assertionRefs: [{ refType: "assertion", refId: "persistence_conservative_movement" }],
      runtimeEvents: [
        {
          eventType: "learning.mastery_evidence.recorded",
          payload: {
            turnId: "turn_compact_1",
            masteryEvidenceId: "mev_compact_1",
            correctnessLabel: "partial",
            confidence: 0.55,
            triggerSource: "runtime_auto",
          },
          timestamp: "2026-05-22T00:04:30.000Z",
        },
      ],
    });

    expect(assertions[0]?.status).toBe("passed");
    expect(assertions[0]?.evidenceRefs).toEqual(expect.arrayContaining([{ refType: "turn", refId: "turn_compact_1" }]));
  });

  it("checks runtime assertions by feature instead of requiring mastery evidence for every runtime path", () => {
    const assertions = evaluateSyntheticLearnerAssertions({
      assertionRefs: [
        { refType: "assertion", refId: "runtime_artifact_lifecycle" },
        { refType: "assertion", refId: "runtime_mastery_evidence" },
      ],
      transcript: ["RUN STARTED: slrun_1", "TUTOR COMPLETE: I created a source-grounded quiz."],
      tutorMessages: ["I created a source-grounded quiz."],
      toolEvents: [
        { label: "completed", toolName: "notebook.get_context", nodeRefs: [] },
        { label: "completed", toolName: "artifact.create_quiz", nodeRefs: [{ refType: "artifact", refId: "artifact_1" }] },
      ],
      runtimeEvents: [
        {
          eventType: "notebook.get_context",
          payload: {},
          timestamp: "2026-05-22T00:04:30.000Z",
        },
        {
          eventType: "artifact.created",
          payload: {},
          timestamp: "2026-05-22T00:04:31.000Z",
        },
      ],
      traceRefs: [{ refType: "session", refId: "sess_1" }],
    });

    expect(assertions[0]?.status).toBe("passed");
    expect(assertions[1]?.status).toBe("failed");
    expect(assertions[1]?.failureMessage).toContain("mastery evaluation evidence");
  });

  it("does not require same-turn tool calls for mastery evidence runtime assertions", () => {
    const assertions = evaluateSyntheticLearnerAssertions({
      assertionRefs: [{ refType: "assertion", refId: "runtime_mastery_evidence" }],
      transcript: ["RUN STARTED: slrun_1", "TUTOR: Let us check this misconception."],
      runtimeEvents: [
        {
          eventType: "learning.mastery_evidence.recorded",
          payload: { masteryEvidenceId: "mev_1" },
          timestamp: "2026-05-22T00:04:30.000Z",
        },
        {
          eventType: "session.context.selected",
          payload: { sessionId: "sess_1" },
          timestamp: "2026-05-22T00:04:31.000Z",
        },
      ],
      traceRefs: [{ refType: "session", refId: "sess_1" }],
    });

    expect(assertions[0]?.status).toBe("passed");
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

  it("keeps qualitative rubric results separate from deterministic gate status", () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
      scenarios: [syntheticLearnerEvalTracerBulletScenarios[0]!],
    });
    const rubricResults = buildSkippedSyntheticLearnerRubricResults({
      definitions: syntheticLearnerEvalRubrics,
      evidenceRefs: [{ refType: "session", refId: "sess_rubric_1" }],
    });
    const runRecord = buildSyntheticLearnerEvalRunRecord({
      matrix,
      runId: "slrun_rubric_separation",
      completedAt: "2026-05-22T00:05:00.000Z",
      rubricResults,
      scenarioRuns: [
        syntheticLearnerEvalScenarioRunSchema.parse({
          ...matrix.runs[0]!,
          id: "slrun_rubric_separation_0",
          runId: "slrun_rubric_separation",
          fixtureVersion: matrix.fixture.version,
          status: "passed",
          startedAt: "2026-05-22T00:00:00.000Z",
          completedAt: "2026-05-22T00:05:00.000Z",
          steps: [],
          assertions: [],
          artifactRefs: [],
          screenshotRefs: [],
          traceRefs: [],
          notebookRefs: [{ refType: "notebook", refId: "nb_rubric_1" }],
          runKind: "regression",
          rubricResults,
          finalState: { passed: true, summary: "Scenario passed." },
        }),
      ],
    });

    expect(runRecord.status).toBe("passed");
    expect(deriveDeterministicGateStatus({ scenarioRuns: runRecord.scenarioRuns })).toBe("passed");
    expect(runRecord.rubricResults).toHaveLength(2);
    expect(runRecord.rubricResults.every((result) => result.qualitative)).toBe(true);
    expect(runRecord.rubricResults.every((result) => result.status === "skipped")).toBe(true);
  });

  it("exports issue candidates for failed LLM learner runs without publishing GitHub issues", () => {
    const issueCandidate = syntheticLearnerEvalIssueCandidateSchema.parse({
      title: "Synthetic Learner found a quiz artifact failure",
      severity: "high",
      learnerMode: "scenario_autonomous_llm",
      runKind: "scenario_autonomous",
      personaId: "persona_anxious_exam_prep",
      scenarioId: "scenario_artifact_request",
      fixtureManifestId: syntheticLearnerEvalTracerBulletFixture.id,
      fixtureVersion: syntheticLearnerEvalTracerBulletFixture.version,
      seededNotebookId: "nb_issue_candidate",
      failureSummary: "The learner could not inspect the generated quiz artifact.",
      transcriptExcerpt: ["STUDENT: Can I try the quiz?", "SIMULATOR ACTION FAILED: artifact.view"],
      evidenceRefs: [{ refType: "artifact", refId: "artifact_quiz_1" }],
      reproductionCommand: "pnpm --filter @studyagent/worker synthetic-learner-evals -- --learner-mode=scenario_autonomous_llm --scenario=scenario_artifact_request",
    });

    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
      scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
    });
    const scenarioRun = syntheticLearnerEvalScenarioRunSchema.parse({
      ...matrix.runs[0]!,
      id: "slrun_issue_candidate_0",
      runId: "slrun_issue_candidate",
      fixtureVersion: matrix.fixture.version,
      status: "failed",
      completedAt: "2026-05-24T00:05:00.000Z",
      steps: [],
      assertions: [],
      artifactRefs: [],
      screenshotRefs: [],
      traceRefs: issueCandidate.evidenceRefs,
      notebookRefs: [{ refType: "notebook", refId: "nb_issue_candidate" }],
      runKind: "scenario_autonomous",
      learnerMode: "scenario_autonomous_llm",
      gatingPolicy: "non_ci_gating",
      issueCandidates: [issueCandidate],
      rubricResults: [],
      finalState: { passed: false, summary: issueCandidate.failureSummary },
    });
    const runRecord = buildSyntheticLearnerEvalRunRecord({
      matrix,
      runId: "slrun_issue_candidate",
      scenarioRuns: [scenarioRun],
      completedAt: "2026-05-24T00:05:00.000Z",
    });

    expect(runRecord.status).toBe("failed");
    expect(runRecord.issueCandidates).toHaveLength(1);
    expect(runRecord.issueCandidates[0]?.publishedIssueUrl).toBeUndefined();
  });
});
