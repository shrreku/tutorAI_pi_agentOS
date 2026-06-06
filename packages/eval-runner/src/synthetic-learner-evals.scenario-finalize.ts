import type {
  EvalSourceFixtureManifest,
  NodeRef,
  SyntheticLearnerEvalObservationEvent,
  SyntheticLearnerEvalRunPlan,
  SyntheticLearnerEvalRunRecord,
  SyntheticLearnerEvalScenarioRun,
  SyntheticLearnerPersona,
  SyntheticLearnerRubricResult,
  SyntheticLearnerRuntimeEvent,
  SyntheticLearnerScenario,
  SyntheticLearnerToolEvent,
  SyntheticLearnerAssertion,
  SyntheticLearnerAssertionReference,
} from "@studyagent/schemas";
import {
  observationForFinalStatus,
  observationFromIssueCandidate,
} from "./synthetic-learner-evals.observation.js";
import type { SyntheticLearnerAssertionPersistenceEvidence } from "@studyagent/schemas";
import {
  buildEvalEvidenceSnapshot,
  buildTraitRecommendationOnlySnapshot,
  buildSyntheticLearnerEvalRunRecord,
  buildSyntheticLearnerIssueCandidates,
  evalEvidenceSnapshotToPersistenceEvidence,
  mergeEvalEvidenceSnapshots,
  missingRequiredSnapshotCategories,
  requiredSnapshotCategoriesForAssertionRefs,
  type EvalEvidenceSnapshot,
} from "@studyagent/schemas";
import {
  evaluateSyntheticLearnerAssertions,
  mergePersistenceEvidenceWithRuntime,
  persistenceEvidenceFromRuntimeEvents,
} from "./synthetic-learner-evals.assertions.js";

export type ScenarioExecutionEvidenceInput = {
  notebookId: string;
  steps: SyntheticLearnerEvalScenarioRun["steps"];
  allNotebookEvents: SyntheticLearnerRuntimeEvent[];
  supplementalPersistence?: SyntheticLearnerAssertionPersistenceEvidence;
};

export function buildExecutionEvidenceInput(input: ScenarioExecutionEvidenceInput): Parameters<typeof buildEvalEvidenceSnapshot>[0] {
  const tutorTurns = input.steps.flatMap((step) =>
    step.traceRefs.filter((ref) => ref.refType === "turn").map((ref) => ({ ref })),
  );
  const toolCalls = input.steps.flatMap((step) =>
    step.toolEvents.flatMap((event) => event.nodeRefs.filter((ref) => ref.refType === "tool_call").map((ref) => ({ ref }))),
  );
  const notebookEvents = input.allNotebookEvents.map((event) => ({
    ref: { refType: "notebook" as const, refId: input.notebookId },
    eventType: event.eventType,
    timestamp: event.timestamp,
  }));
  return {
    id: "execution",
    notebookId: input.notebookId,
    tutorTurns,
    toolCalls,
    notebookEvents,
    ...(input.supplementalPersistence?.masteryEvidence ? { masteryEvidence: input.supplementalPersistence.masteryEvidence } : {}),
    ...(input.supplementalPersistence?.artifacts ? { artifacts: input.supplementalPersistence.artifacts } : {}),
    ...(input.supplementalPersistence?.sessionEvents ? { sessionEvents: input.supplementalPersistence.sessionEvents } : {}),
    ...(input.supplementalPersistence?.sessionEvents
      ? {
          learnerTraitSignals: input.supplementalPersistence.sessionEvents
            .filter((event) => event.eventType.startsWith("learner_trait."))
            .flatMap((event) => (event.ref ? [{ ref: event.ref }] : [])),
          learnerTraitEstimates: input.supplementalPersistence.sessionEvents
            .filter((event) => event.eventType.startsWith("learner_trait."))
            .flatMap((event) => (event.ref?.refType === "trait_estimate" ? [{ ref: event.ref }] : [])),
        }
      : {}),
  };
}

export async function resolveScenarioEvalEvidenceSnapshot(input: {
  runId: string;
  scenarioId: string;
  notebookId: string;
  assertionRefs: SyntheticLearnerAssertionReference[];
  execution: ScenarioExecutionEvidenceInput;
  beforeSnapshot?: EvalEvidenceSnapshot;
  afterEstimationSnapshot?: EvalEvidenceSnapshot;
  captureSnapshot?: (input: { notebookId: string; snapshotId: string }) => Promise<EvalEvidenceSnapshot>;
  supplementalPersistence?: SyntheticLearnerAssertionPersistenceEvidence;
}): Promise<{ snapshots: EvalEvidenceSnapshot[]; persistence: SyntheticLearnerAssertionPersistenceEvidence }> {
  const requiredCategories = requiredSnapshotCategoriesForAssertionRefs(input.assertionRefs);
  const afterSnapshotId = `snap_${input.runId}_${input.scenarioId}_after`;
  const capturedAfter = input.captureSnapshot
    ? await input.captureSnapshot({ notebookId: input.notebookId, snapshotId: afterSnapshotId })
    : buildEvalEvidenceSnapshot({
        ...buildExecutionEvidenceInput(input.execution),
        id: afterSnapshotId,
        requiredCategories,
        ...(input.supplementalPersistence?.traitRecommendationOnlySnapshot
          ? { traitRecommendationOnlySnapshot: input.supplementalPersistence.traitRecommendationOnlySnapshot }
          : {}),
      });

  const executionSnapshot = buildEvalEvidenceSnapshot({
    ...buildExecutionEvidenceInput({
      notebookId: input.execution.notebookId,
      steps: input.execution.steps,
      allNotebookEvents: input.execution.allNotebookEvents,
      ...(input.execution.supplementalPersistence ? { supplementalPersistence: input.execution.supplementalPersistence } : {}),
    }),
    id: `snap_${input.runId}_${input.scenarioId}_execution`,
    requiredCategories,
  });

  let afterSnapshot = mergeEvalEvidenceSnapshots({
    persisted: capturedAfter,
    supplemental: {
      ...buildExecutionEvidenceInput({
        notebookId: input.execution.notebookId,
        steps: input.execution.steps,
        allNotebookEvents: input.execution.allNotebookEvents,
        ...(input.execution.supplementalPersistence ? { supplementalPersistence: input.execution.supplementalPersistence } : {}),
      }),
    },
  });

  if (input.beforeSnapshot) {
    const traitAfterSnapshot = input.afterEstimationSnapshot ?? afterSnapshot;
    afterSnapshot = {
      ...afterSnapshot,
      traitRecommendationOnlySnapshot: buildTraitRecommendationOnlySnapshot({
        before: input.beforeSnapshot,
        after: traitAfterSnapshot,
      }),
    };
  } else if (input.supplementalPersistence?.traitRecommendationOnlySnapshot) {
    afterSnapshot = {
      ...afterSnapshot,
      traitRecommendationOnlySnapshot: input.supplementalPersistence.traitRecommendationOnlySnapshot,
    };
  }

  const snapshots = [
    ...(input.beforeSnapshot ? [input.beforeSnapshot] : []),
    ...(input.afterEstimationSnapshot ? [input.afterEstimationSnapshot] : []),
    executionSnapshot,
    afterSnapshot,
  ];

  return {
    snapshots,
    persistence: evalEvidenceSnapshotToPersistenceEvidence(afterSnapshot),
  };
}

export function collectExecutedRuntimeEvidence(input: {
  runtimeEvents: SyntheticLearnerRuntimeEvent[];
  toolEvents: SyntheticLearnerToolEvent[];
}): string[] {
  const executed = new Set<string>();
  if (input.runtimeEvents.some((event) => event.eventType.includes("context"))) executed.add("runtime_context_selection");
  if (input.runtimeEvents.some((event) => event.eventType.includes("evaluate_response") || event.eventType.includes("mastery_evidence"))) {
    executed.add("runtime_mastery_evidence");
  }
  if (input.runtimeEvents.some((event) => event.eventType.includes("artifact")) || input.toolEvents.some((event) => event.toolName.includes("artifact"))) {
    executed.add("runtime_artifact_lifecycle");
  }
  if (input.runtimeEvents.some((event) => event.eventType.includes("session") || event.eventType.includes("digest") || event.eventType.includes("crystall"))) {
    executed.add("runtime_session_digest");
  }
  if (input.runtimeEvents.some((event) => event.eventType.startsWith("learner_trait.")) || input.toolEvents.some((event) => event.toolName.includes("learner_trait"))) {
    executed.add("runtime_trait_estimation");
  }
  return [...executed];
}

export function uniqueNodeRefs(refs: NodeRef[]): NodeRef[] {
  const seen = new Set<string>();
  const deduped: NodeRef[] = [];
  for (const ref of refs) {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

export function persistenceAssertionsRequireSnapshot(assertionRefs: SyntheticLearnerEvalRunPlan["assertionRefs"]): boolean {
  return assertionRefs.some((ref) => ref.refId.startsWith("persistence_"));
}

export async function finalizeSyntheticLearnerScenarioRun(input: {
  matrix: Parameters<typeof buildSyntheticLearnerEvalRunRecord>[0]["matrix"];
  plan: SyntheticLearnerEvalRunPlan;
  scenario: SyntheticLearnerScenario;
  persona: SyntheticLearnerPersona;
  runId: string;
  notebookId: string;
  seededNotebookRef: NodeRef;
  startedAt: string;
  completedAt?: string;
  finalStatus: SyntheticLearnerEvalScenarioRun["status"];
  finalSummary: string;
  steps: SyntheticLearnerEvalScenarioRun["steps"];
  scenarioAssertions: SyntheticLearnerAssertion[];
  assertionResultsById?: Map<string, SyntheticLearnerAssertion>;
  finalAssertionInput?: {
    transcript: string[];
    tutorMessages: string[];
    toolEvents: SyntheticLearnerToolEvent[];
    runtimeEvents: SyntheticLearnerRuntimeEvent[];
    notebookEvents: SyntheticLearnerRuntimeEvent[];
    traceRefs: NodeRef[];
    notebookRefs: NodeRef[];
  };
  scenarioTraceRefs: NodeRef[];
  screenshotRefs?: NodeRef[];
  observationEvents: SyntheticLearnerEvalObservationEvent[];
  transcript: string[];
  allNotebookEvents: SyntheticLearnerRuntimeEvent[];
  runtimeEvents: SyntheticLearnerRuntimeEvent[];
  toolEvents: SyntheticLearnerToolEvent[];
  actionRepairAttempts?: number;
  simulatorEvidence?: SyntheticLearnerEvalScenarioRun["simulatorEvidence"];
  rubricResults?: SyntheticLearnerRubricResult[];
  autonomyStartProfile?: SyntheticLearnerEvalScenarioRun["autonomyStartProfile"];
  beforeSnapshot?: EvalEvidenceSnapshot;
  afterEstimationSnapshot?: EvalEvidenceSnapshot;
  captureSnapshot?: (input: { notebookId: string; snapshotId: string }) => Promise<EvalEvidenceSnapshot>;
  supplementalPersistence?: SyntheticLearnerAssertionPersistenceEvidence;
  writeObservation?: (
    event: Omit<SyntheticLearnerEvalObservationEvent, "id" | "runId" | "timestamp"> & { timestamp?: string },
  ) => Promise<void>;
}): Promise<{
  scenarioRun: SyntheticLearnerEvalScenarioRun;
  runRecord: SyntheticLearnerEvalRunRecord;
  observationEvents: SyntheticLearnerEvalObservationEvent[];
}> {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const evidence = await resolveScenarioEvalEvidenceSnapshot({
    runId: input.runId,
    scenarioId: input.scenario.id,
    notebookId: input.notebookId,
    assertionRefs: input.plan.assertionRefs,
    execution: {
      notebookId: input.notebookId,
      steps: input.steps,
      allNotebookEvents: input.allNotebookEvents,
      ...(input.supplementalPersistence ? { supplementalPersistence: input.supplementalPersistence } : {}),
    },
    ...(input.beforeSnapshot ? { beforeSnapshot: input.beforeSnapshot } : {}),
    ...(input.afterEstimationSnapshot ? { afterEstimationSnapshot: input.afterEstimationSnapshot } : {}),
    ...(input.captureSnapshot ? { captureSnapshot: input.captureSnapshot } : {}),
    ...(input.supplementalPersistence ? { supplementalPersistence: input.supplementalPersistence } : {}),
  });

  const requiredCategories = requiredSnapshotCategoriesForAssertionRefs(input.plan.assertionRefs);
  const afterSnapshot = evidence.snapshots.at(-1);
  const missingCategories = afterSnapshot ? missingRequiredSnapshotCategories(afterSnapshot) : requiredCategories;
  const snapshotComplete = requiredCategories.every((category) => !missingCategories.includes(category));
  const persistence = !snapshotComplete && input.finalAssertionInput
    ? mergePersistenceEvidenceWithRuntime(
        evidence.persistence,
        persistenceEvidenceFromRuntimeEvents(input.finalAssertionInput.runtimeEvents),
      )
    : evidence.persistence;
  const disableRuntimeFallback = persistenceAssertionsRequireSnapshot(input.plan.assertionRefs)
    && Boolean(input.captureSnapshot)
    && snapshotComplete;
  let scenarioAssertions = input.scenarioAssertions;
  let finalStatus = input.finalStatus;
  let finalSummary = input.finalSummary;
  if (input.finalAssertionInput) {
    const assertionResultsById = input.assertionResultsById ?? new Map(input.scenarioAssertions.map((assertion) => [assertion.id, assertion]));
    const finalAssertions = evaluateSyntheticLearnerAssertions({
      assertionRefs: input.plan.assertionRefs,
      ...input.finalAssertionInput,
      ...(persistence ? { persistence } : {}),
      disableRuntimeFallback,
    });
    for (const assertion of finalAssertions) {
      assertionResultsById.set(assertion.id, assertion);
    }
    scenarioAssertions = [...assertionResultsById.values()];
    const failedAssertion = scenarioAssertions.find((assertion) => assertion.status === "failed");
    if (failedAssertion) {
      finalStatus = "failed";
      finalSummary = failedAssertion.failureMessage ?? failedAssertion.description;
    }
  }

  const finalObservation = observationForFinalStatus({
    runId: input.runId,
    scenarioRunId: `${input.runId}_${input.scenario.id}`,
    status: finalStatus,
    summary: finalSummary,
  });
  input.observationEvents.push(finalObservation);
  await input.writeObservation?.(finalObservation);

  const scenarioRunWithoutCandidates = {
    id: `${input.runId}_${input.scenario.id}`,
    runId: input.runId,
    fixtureManifestId: input.matrix.fixture.id,
    fixtureVersion: input.matrix.fixture.version,
    personaId: input.persona.id,
    scenarioId: input.scenario.id,
    seededNotebookId: input.notebookId,
    status: finalStatus,
    startedAt: input.startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(input.startedAt)),
    steps: input.steps,
    assertions: scenarioAssertions,
    artifactRefs: uniqueNodeRefs(input.steps.flatMap((step) => step.artifactRefs ?? [])),
    screenshotRefs: uniqueNodeRefs(input.screenshotRefs ?? []),
    traceRefs: uniqueNodeRefs(input.scenarioTraceRefs),
    notebookRefs: [input.seededNotebookRef],
    runKind: input.plan.runKind,
    learnerMode: input.plan.learnerMode,
    ...(input.plan.simulatorModel ? { simulatorModel: input.plan.simulatorModel } : {}),
    ...(input.autonomyStartProfile ? { autonomyStartProfile: input.autonomyStartProfile } : {}),
    gatingPolicy: input.plan.gatingPolicy,
    actionRepairAttempts: input.actionRepairAttempts ?? 0,
    simulatorEvidence: input.simulatorEvidence ?? [],
    issueCandidates: [],
    observationEvents: input.observationEvents,
    evalEvidenceSnapshotRefs: uniqueNodeRefs(evidence.snapshots.flatMap((snapshot) => snapshot.snapshotRefs)),
    evalEvidenceSnapshots: evidence.snapshots,
    evalPlan: input.plan,
    rubricResults: input.rubricResults ?? [],
    finalState: {
      passed: finalStatus === "passed",
      summary: finalSummary,
    },
  } satisfies SyntheticLearnerEvalScenarioRun;

  const issueCandidates = buildSyntheticLearnerIssueCandidates({
    scenarioRun: scenarioRunWithoutCandidates,
    fixture: input.matrix.fixture,
    transcript: input.transcript,
    assertionRefs: input.plan.assertionRefs,
    observationEventCount: input.observationEvents.length,
    executedActions: collectExecutedRuntimeEvidence({
      runtimeEvents: input.runtimeEvents,
      toolEvents: input.toolEvents,
    }),
    issueCandidatePolicy: input.plan.issueCandidatePolicy,
  });

  for (const [index, candidate] of issueCandidates.entries()) {
    const issueObservation = observationFromIssueCandidate({
      runId: input.runId,
      scenarioRunId: scenarioRunWithoutCandidates.id,
      candidate,
      index,
    });
    input.observationEvents.push(issueObservation);
    await input.writeObservation?.(issueObservation);
  }

  const scenarioRun = {
    ...scenarioRunWithoutCandidates,
    issueCandidates,
  } satisfies SyntheticLearnerEvalScenarioRun;

  const runRecord = buildSyntheticLearnerEvalRunRecord({
    matrix: input.matrix,
    scenarioRuns: [scenarioRun],
    runId: input.runId,
    startedAt: input.startedAt,
    completedAt,
    notebookRefs: scenarioRun.notebookRefs,
    transcript: input.transcript,
    observationEvents: input.observationEvents,
    rubricResults: input.rubricResults ?? [],
  });

  return { scenarioRun, runRecord, observationEvents: input.observationEvents };
}

