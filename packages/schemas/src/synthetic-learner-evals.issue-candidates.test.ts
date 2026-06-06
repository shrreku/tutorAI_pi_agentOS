import { describe, expect, it } from "vitest";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerIssueCandidates,
  planSyntheticLearnerEvalRun,
  syntheticLearnerEvalRunPlanSchema,
  syntheticLearnerEvalScenarioRunSchema,
  type SyntheticLearnerEvalScenarioRun,
} from "./synthetic-learner-evals.js";
import {
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalTracerBulletScenarios,
} from "./synthetic-learner-evals.fixtures.js";

function buildScenarioRun(overrides: Partial<SyntheticLearnerEvalScenarioRun> = {}): SyntheticLearnerEvalScenarioRun {
  const matrix = buildSyntheticLearnerEvalMatrix({
    fixture: syntheticLearnerEvalTracerBulletFixture,
    personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
    scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
  });
  const persona = syntheticLearnerEvalTracerBulletPersonas[0]!;
  const scenario = syntheticLearnerEvalTracerBulletScenarios[0]!;
  return syntheticLearnerEvalScenarioRunSchema.parse({
    ...matrix.runs[0]!,
    id: "slrun_issue_candidates_0",
    runId: "slrun_issue_candidates",
    fixtureVersion: matrix.fixture.version,
    status: "passed",
    startedAt: "2026-05-24T00:00:00.000Z",
    completedAt: "2026-05-24T00:05:00.000Z",
    steps: [],
    assertions: [],
    artifactRefs: [],
    screenshotRefs: [],
    traceRefs: [],
    notebookRefs: [{ refType: "notebook", refId: matrix.fixture.seededNotebookId }],
    runKind: "scenario_autonomous",
    learnerMode: "scenario_autonomous_llm",
    gatingPolicy: "non_ci_gating",
    finalState: { passed: true, summary: "Scenario passed." },
    ...overrides,
  });
}

describe("buildSyntheticLearnerIssueCandidates", () => {
  const fixture = syntheticLearnerEvalTracerBulletFixture;

  it("emits all eleven issue-candidate reason codes", () => {
    const suspiciousPass = buildScenarioRun({
      status: "passed",
      finalState: { passed: true, summary: "Scenario finished too quickly without evidence." },
    });
    const failedRun = buildScenarioRun({
      status: "failed",
      actionRepairAttempts: 3,
      observationEvents: [],
      simulatorEvidence: [
        {
          eventType: "action_repaired",
          learnerMode: "scenario_autonomous_llm",
          message: "action repaired",
          repairAttempt: 1,
          timestamp: "2026-05-24T00:01:00.000Z",
        },
        {
          eventType: "model_output_invalid",
          learnerMode: "scenario_autonomous_llm",
          message: "invalid output",
          repairAttempt: 1,
          timestamp: "2026-05-24T00:01:01.000Z",
        },
      ],
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
      assertions: [
        {
          id: "persistence_mastery_evidence",
          category: "persistence",
          description: "Required snapshot.",
          status: "failed",
          passed: false,
          failureMessage: "Required persisted state snapshot was unavailable.",
          evidenceRefs: [],
          details: { reason: "unavailable_required_snapshot" },
        },
        {
          id: "persistence_optional_rubric",
          category: "persistence",
          description: "Optional assertion.",
          status: "skipped",
          passed: false,
          failureMessage: "Optional persisted evidence snapshot was unavailable.",
          evidenceRefs: [],
          details: { reason: "skipped_optional_snapshot" },
        },
        {
          id: "learner_visible_no_id_leak",
          category: "learner_visible",
          description: "No raw ID leak.",
          status: "failed",
          passed: false,
          failureMessage: "Tutor text leaks machine-generated content.",
          evidenceRefs: [],
          details: {},
        },
      ],
      finalState: { passed: false, summary: "Scenario failed." },
      evalPlan: syntheticLearnerEvalRunPlanSchema.parse({
        ...planSyntheticLearnerEvalRun({
          scenario: { ...syntheticLearnerEvalTracerBulletScenarios[0]!, runKind: "scenario_autonomous" },
          persona: syntheticLearnerEvalTracerBulletPersonas[0]!,
          learnerMode: "scenario_autonomous_llm",
        }),
        assertionRefs: [
          { refType: "assertion", refId: "runtime_session_started", required: true },
          { refType: "assertion", refId: "runtime_tool_call", required: true },
        ],
      }),
    });

    const reasons = [
      ...buildSyntheticLearnerIssueCandidates({
        scenarioRun: failedRun,
        fixture,
        executedActions: ["runtime_session_started"],
      }),
      ...buildSyntheticLearnerIssueCandidates({
        scenarioRun: suspiciousPass,
        fixture,
      }),
    ].map((candidate) => candidate.reason);

    expect([...new Set(reasons)].sort()).toEqual([
      "degraded_observation",
      "flaky_retry",
      "invalid_action_repaired",
      "optional_assertion_skipped",
      "quality_warning",
      "raw_id_leak_repaired",
      "required_action_not_covered",
      "required_snapshot_unavailable",
      "run_failed",
      "simulator_tool_mismatch",
      "suspicious_finish",
    ]);
  });

  it("filters warnings when issueCandidatePolicy is failures_only", () => {
    const scenarioRun = buildScenarioRun({
      status: "failed",
      simulatorEvidence: [
        {
          eventType: "action_repaired",
          learnerMode: "scenario_autonomous_llm",
          message: "action repaired",
          repairAttempt: 1,
          timestamp: "2026-05-24T00:01:00.000Z",
        },
      ],
      finalState: { passed: false, summary: "Scenario failed." },
      evalPlan: planSyntheticLearnerEvalRun({
        scenario: { ...syntheticLearnerEvalTracerBulletScenarios[0]!, runKind: "scenario_autonomous" },
        persona: syntheticLearnerEvalTracerBulletPersonas[0]!,
        learnerMode: "scenario_autonomous_llm",
        issueCandidatePolicy: "failures_only",
      }),
    });

    const candidates = buildSyntheticLearnerIssueCandidates({ scenarioRun, fixture });
    expect(candidates.every((candidate) => candidate.kind === "failure")).toBe(true);
    expect(candidates.map((candidate) => candidate.reason)).toEqual(["run_failed"]);
  });
});
