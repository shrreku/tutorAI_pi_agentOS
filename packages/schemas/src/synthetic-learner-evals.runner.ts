import type { NodeRef } from "./ids.js";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
  formatSyntheticLearnerList,
  type EvalSourceFixtureManifest,
  type SyntheticLearnerAssertion,
  type SyntheticLearnerActionDecision,
  type SyntheticLearnerActionObservation,
  type SyntheticLearnerAutonomyStartProfile,
  type SyntheticLearnerBrowserStep,
  type SyntheticLearnerEvalMatrix,
  type SyntheticLearnerEvalRunRecord,
  type SyntheticLearnerEvalScenarioRun,
  type SyntheticLearnerGatingPolicy,
  type SyntheticLearnerLearnerResponse,
  type SyntheticLearnerMode,
  type SyntheticLearnerModelConfig,
  type SyntheticLearnerPersona,
  type SyntheticLearnerRubricResult,
  type SyntheticLearnerScenario,
  type SyntheticLearnerToolEvent,
  type SyntheticLearnerRuntimeEvent,
  syntheticLearnerActionDecisionSchema,
} from "./synthetic-learner-evals.js";
import {
  evaluateSyntheticLearnerAssertions,
  type SyntheticLearnerAssertionPersistenceEvidence,
} from "./synthetic-learner-evals.assertions.js";
import {
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalTracerBulletScenarios,
} from "./synthetic-learner-evals.fixtures.js";

export type SyntheticLearnerEvalStreamEvent =
  | { source: "tutor"; eventType: string; payload: Record<string, unknown> }
  | { source: "runtime"; eventType: string; payload: Record<string, unknown> }
  | { source: "notebook"; eventType: string; payload: Record<string, unknown> };

export type SyntheticLearnerEvalScenarioTurnResult = {
  sessionId: string;
  runId: string;
  assistantMessage: string;
  events: SyntheticLearnerEvalStreamEvent[];
  traceRefs?: NodeRef[];
  notebookEvents?: SyntheticLearnerEvalStreamEvent[];
};

export type SyntheticLearnerEvalSeedResult = {
  notebookId: string;
  notebookRef?: NodeRef;
  traceRefs?: NodeRef[];
};

export type SyntheticLearnerEvalRunnerApi = {
  seedNotebook(input: {
    fixture: EvalSourceFixtureManifest;
    persona: { id: string; name: string };
    scenario: SyntheticLearnerScenario;
  }): Promise<SyntheticLearnerEvalSeedResult>;
  sendTutorTurn(input: {
    notebookId: string;
    scenario: SyntheticLearnerScenario;
    scriptedMessage: string;
    turnIndex: number;
  }): Promise<SyntheticLearnerEvalScenarioTurnResult>;
};

export type SyntheticLearnerSimulatorActions = {
  execute(input: {
    notebookId: string;
    scenario: SyntheticLearnerScenario;
    decision: SyntheticLearnerActionDecision;
  }): Promise<SyntheticLearnerActionObservation>;
};

export type SyntheticLearnerModelClient = {
  generateActionDecision(input: {
    prompt: string;
    learnerMode: SyntheticLearnerMode;
    repairFeedback?: string;
  }): Promise<unknown>;
  generateLearnerResponse(input: {
    prompt: string;
    learnerMode: SyntheticLearnerMode;
    observation: SyntheticLearnerActionObservation;
  }): Promise<unknown>;
};

export type SyntheticLearnerEvalTranscriptWriter = (line: string) => void | Promise<void>;

export type SyntheticLearnerEvalBrowserStepResult = {
  status: "passed" | "failed" | "skipped";
  message: string;
  screenshotRefs?: NodeRef[];
  evidenceRefs?: NodeRef[];
};

export type SyntheticLearnerEvalBrowserExecutor = (input: {
  step: SyntheticLearnerBrowserStep;
  notebookId: string;
  scenario: SyntheticLearnerScenario;
}) => Promise<SyntheticLearnerEvalBrowserStepResult>;

export type RunSyntheticLearnerEvalScenarioInput = {
  matrix: SyntheticLearnerEvalMatrix;
  scenarioId?: string;
  personaId?: string;
  api: SyntheticLearnerEvalRunnerApi;
  writeTranscript?: SyntheticLearnerEvalTranscriptWriter;
  persistenceEvidence?: SyntheticLearnerAssertionPersistenceEvidence;
  browserExecutor?: SyntheticLearnerEvalBrowserExecutor;
  rubricResults?: SyntheticLearnerRubricResult[];
  learnerMode?: SyntheticLearnerMode;
  simulatorModelConfig?: SyntheticLearnerModelConfig;
  syntheticLearnerModel?: SyntheticLearnerModelClient;
  simulatorActions?: SyntheticLearnerSimulatorActions;
  autonomyStartProfile?: SyntheticLearnerAutonomyStartProfile;
  gatingPolicy?: SyntheticLearnerGatingPolicy;
  startedAt?: string;
  completedAt?: string;
  runId?: string;
};

export type RunSyntheticLearnerEvalScenarioResult = {
  matrix: SyntheticLearnerEvalMatrix;
  scenario: SyntheticLearnerScenario;
  scenarioRun: SyntheticLearnerEvalScenarioRun;
  runRecord: SyntheticLearnerEvalRunRecord;
  transcript: string[];
};

export type RunSyntheticLearnerEvalSuiteInput = {
  matrix: SyntheticLearnerEvalMatrix;
  api: SyntheticLearnerEvalRunnerApi;
  writeTranscript?: SyntheticLearnerEvalTranscriptWriter;
  persistenceEvidence?: SyntheticLearnerAssertionPersistenceEvidence;
  browserExecutor?: SyntheticLearnerEvalBrowserExecutor;
  rubricResults?: SyntheticLearnerRubricResult[];
  learnerMode?: SyntheticLearnerMode;
  simulatorModelConfig?: SyntheticLearnerModelConfig;
  syntheticLearnerModel?: SyntheticLearnerModelClient;
  simulatorActions?: SyntheticLearnerSimulatorActions;
  autonomyStartProfile?: SyntheticLearnerAutonomyStartProfile;
  gatingPolicy?: SyntheticLearnerGatingPolicy;
  startedAt?: string;
  completedAt?: string;
  runId?: string;
  scenarioIds?: string[];
  personaIds?: string[];
};

export type RunSyntheticLearnerEvalSuiteResult = {
  matrix: SyntheticLearnerEvalMatrix;
  scenarioRuns: SyntheticLearnerEvalScenarioRun[];
  runRecord: SyntheticLearnerEvalRunRecord;
  transcript: string[];
};

export type SyntheticLearnerTriggerAdapterInput = Omit<RunSyntheticLearnerEvalSuiteInput, "runId"> & {
  triggerRunId?: string;
};

export type SyntheticLearnerTriggerAdapter = {
  invoke(input: SyntheticLearnerTriggerAdapterInput): Promise<RunSyntheticLearnerEvalSuiteResult>;
};

export function loadTracerBulletSyntheticLearnerEvalMatrix(): SyntheticLearnerEvalMatrix {
  return buildSyntheticLearnerEvalMatrix({
    fixture: syntheticLearnerEvalTracerBulletFixture,
    personas: syntheticLearnerEvalTracerBulletPersonas,
    scenarios: syntheticLearnerEvalTracerBulletScenarios,
  });
}

export async function runSyntheticLearnerEvalScenario(
  input: RunSyntheticLearnerEvalScenarioInput,
): Promise<RunSyntheticLearnerEvalScenarioResult> {
  const scenario =
    (input.scenarioId ? input.matrix.scenarios.find((candidate) => candidate.id === input.scenarioId) : undefined) ??
    input.matrix.scenarios[0];
  if (!scenario) {
    throw new Error("Synthetic learner eval matrix does not contain a scenario.");
  }

  const persona =
    (input.personaId
      ? input.matrix.personas.find((candidate) => candidate.id === input.personaId)
      : undefined) ?? input.matrix.personas.find((candidate) => scenario.personaIds.includes(candidate.id));
  if (!persona) {
    throw new Error(`No persona found for scenario ${scenario.id}.`);
  }

  const transcript: string[] = [];
  const writeTranscript = async (line: string): Promise<void> => {
    transcript.push(line);
    await input.writeTranscript?.(line);
  };

  const startedAt = input.startedAt ?? input.matrix.fixture.generatedAt;
  const runId = input.runId ?? `slrun_${input.matrix.fixture.id}_${persona.id}_${crypto.randomUUID().slice(0, 8)}`;
  const learnerMode = input.learnerMode ?? "scripted";
  const gatingPolicy = input.gatingPolicy ?? (learnerMode === "scripted" ? "ci_gating" : "non_ci_gating");

  await writeTranscript(`RUN STARTED: ${runId}`);
  await writeTranscript(`SCENARIO: ${scenario.name}`);
  await writeTranscript(`PERSONA: ${persona.name}`);
  await writeTranscript(`LEARNER MODE: ${learnerMode}`);
  await writeTranscript(`ASSERTIONS: ${formatSyntheticLearnerList(scenario.assertionRefs.map((ref) => ref.refId), ", ")}`);

  const seeded = await input.api.seedNotebook({
    fixture: input.matrix.fixture,
    persona: { id: persona.id, name: persona.name },
    scenario,
  });

  await writeTranscript(`NOTEBOOK SEEDED: ${seeded.notebookId}`);

  if (learnerMode === "scenario_autonomous_llm" || learnerMode === "full_autonomous_llm") {
    const autonomousResult = await runAutonomousLearnerScenario({
      ...input,
      scenario,
      persona,
      seeded,
      transcript,
      writeTranscript,
      startedAt,
      runId,
      learnerMode,
      gatingPolicy,
    });
    return autonomousResult;
  }

  const steps: SyntheticLearnerEvalScenarioRun["steps"] = [];
  const seededNotebookRef: NodeRef = seeded.notebookRef ?? { refType: "notebook", refId: seeded.notebookId };
  let scenarioTraceRefs: NodeRef[] = [
    seededNotebookRef,
    ...(seeded.traceRefs ?? []),
  ];
  const allNotebookEvents: SyntheticLearnerRuntimeEvent[] = [];
  const assertionResultsById = new Map<string, SyntheticLearnerAssertion>();
  const scenarioScreenshotRefs: NodeRef[] = [];

  let finalStatus: SyntheticLearnerEvalScenarioRun["status"] = "passed";
  let finalSummary = "Scenario completed cleanly.";
  let completedAt = input.completedAt;

  for (const [index, beat] of scenario.beats.entries()) {
    const beatStartedAt = new Date().toISOString();
    const stepId = `${scenario.id}_step_${index + 1}`;
    const stepTranscriptStart = transcript.length;
    let stepAssertions: SyntheticLearnerAssertion[] = [];

    const learnerMessage = await resolveBeatLearnerMessage({
      learnerMode,
      fixture: input.matrix.fixture,
      persona,
      scenario,
      beatIndex: index,
      transcript,
      ...(input.syntheticLearnerModel ? { model: input.syntheticLearnerModel } : {}),
      ...(input.simulatorModelConfig ? { modelConfig: input.simulatorModelConfig } : {}),
    });

    await writeTranscript(`STUDENT: ${learnerMessage}`);

    try {
      const turn = await input.api.sendTutorTurn({
        notebookId: seeded.notebookId,
        scenario,
        scriptedMessage: learnerMessage,
        turnIndex: index,
      });

      const toolEvents: SyntheticLearnerToolEvent[] = [];
      const runtimeEvents: SyntheticLearnerRuntimeEvent[] = [];
      const stepNotebookEvents: SyntheticLearnerRuntimeEvent[] = [];
      const traceRefs: NodeRef[] = [...scenarioTraceRefs, ...(turn.traceRefs ?? [])];

      for (const event of [...turn.events, ...(turn.notebookEvents ?? [])]) {
        if (event.source === "tutor") {
          if (event.eventType === "TEXT_MESSAGE_CONTENT" && (typeof event.payload.text === "string" || typeof event.payload.content === "string" || typeof event.payload.delta === "string")) {
            const text = typeof event.payload.text === "string"
              ? event.payload.text
              : typeof event.payload.content === "string"
                ? event.payload.content
                : String(event.payload.delta);
            await writeTranscript(`TUTOR: ${text}`);
          } else if (event.eventType === "TEXT_MESSAGE_END" && turn.assistantMessage) {
            await writeTranscript(`TUTOR COMPLETE: ${turn.assistantMessage}`);
          } else if (event.eventType === "TOOL_CALL_START" || event.eventType === "tool_call_start") {
            const toolName = typeof event.payload.toolName === "string" ? event.payload.toolName : "unknown_tool";
            toolEvents.push({
              label: "started",
              toolName,
              nodeRefs: [],
            });
            await writeTranscript(`TOOL START: ${toolName}`);
          } else if (event.eventType === "TOOL_CALL_COMPLETE" || event.eventType === "TOOL_CALL_END" || event.eventType === "tool_call_complete") {
            const toolName = typeof event.payload.toolName === "string" ? event.payload.toolName : "unknown_tool";
            toolEvents.push({
              label: "completed",
              toolName,
              nodeRefs: [],
            });
            await writeTranscript(`TOOL COMPLETE: ${toolName}`);
          } else if (event.eventType === "RUN_ERROR") {
            finalStatus = "failed";
            finalSummary = stringifyFailure(event.payload.error ?? event.payload.message ?? "Tutor stream failed");
            await writeTranscript(`ERROR: ${finalSummary}`);
          }
        } else if (event.source === "runtime") {
          runtimeEvents.push({
            eventType: event.eventType,
            payload: event.payload,
            timestamp: typeof event.payload.timestamp === "string" ? event.payload.timestamp : new Date().toISOString(),
          });
          await writeTranscript(`RUNTIME: ${event.eventType}`);
        } else if (event.source === "notebook") {
          const notebookEvent = {
            eventType: event.eventType,
            payload: event.payload,
            timestamp: typeof event.payload.timestamp === "string" ? event.payload.timestamp : new Date().toISOString(),
          };
          stepNotebookEvents.push(notebookEvent);
          allNotebookEvents.push(notebookEvent);
          await writeTranscript(`NOTEBOOK EVENT: ${event.eventType}`);
          traceRefs.push({
            refType: "session",
            refId: typeof event.payload.sessionId === "string" ? event.payload.sessionId : turn.sessionId,
          });
        }
      }

      stepAssertions = evaluateSyntheticLearnerAssertions({
        assertionRefs: beat.assertionRefs,
        transcript: transcript.slice(stepTranscriptStart),
        tutorMessages: [turn.assistantMessage],
        toolEvents,
        runtimeEvents,
        notebookEvents: stepNotebookEvents,
        traceRefs: uniqueNodeRefs(traceRefs),
        notebookRefs: [seededNotebookRef],
        ...(input.persistenceEvidence ? { persistence: input.persistenceEvidence } : {}),
      });
      const stepFinalStatus = summarizeAssertionStatuses(stepAssertions);
      for (const assertion of stepAssertions) {
        assertionResultsById.set(assertion.id, assertion);
      }
      if (stepFinalStatus.status === "failed") {
        finalStatus = "failed";
        finalSummary = stepFinalStatus.summary;
      }

      steps.push({
        id: stepId,
        stepIndex: index,
        kind: "prompt",
        status: stepFinalStatus.status,
        startedAt: beatStartedAt,
        completedAt: input.completedAt ?? new Date().toISOString(),
        studentMessage: beat.scriptedMessage,
        ...(turn.assistantMessage ? { tutorMessage: turn.assistantMessage } : {}),
        toolEvents,
        runtimeEvents,
        assertions: stepAssertions,
        artifactRefs: [],
        screenshotRefs: [],
        traceRefs: uniqueNodeRefs(traceRefs),
        details: {
          beatId: beat.id,
          beatKind: beat.kind,
          scriptedMessage: beat.scriptedMessage,
          learnerMessage,
          liveInstruction: beat.liveInstruction,
        },
      });

      scenarioTraceRefs = uniqueNodeRefs(traceRefs);
      if (shouldStopScenarioAfterBeat(scenario.stopConditions, beat.stopConditions, runtimeEvents, toolEvents)) {
        break;
      }
      if (finalStatus === "failed") break;
    } catch (error) {
      finalStatus = "failed";
      finalSummary = stringifyFailure(error);
      await writeTranscript(`ERROR: ${finalSummary}`);
      stepAssertions = [
        {
          id: `${stepId}_runtime_failure`,
          category: "runtime",
          description: "Tutor stream completed without a deterministic assertion result.",
          status: "failed",
          passed: false,
          failureMessage: stringifyFailure(error),
          evidenceRefs: uniqueNodeRefs(scenarioTraceRefs),
          details: { beatId: beat.id },
        },
      ];
      for (const assertion of stepAssertions) {
        assertionResultsById.set(assertion.id, assertion);
      }
      steps.push({
        id: stepId,
        stepIndex: index,
        kind: "prompt",
        status: "failed",
        startedAt: beatStartedAt,
        completedAt: input.completedAt ?? new Date().toISOString(),
        studentMessage: learnerMessage,
        toolEvents: [],
        runtimeEvents: [],
        assertions: stepAssertions,
        artifactRefs: [],
        screenshotRefs: [],
        traceRefs: uniqueNodeRefs(scenarioTraceRefs),
        details: {
          beatId: beat.id,
          beatKind: beat.kind,
          scriptedMessage: beat.scriptedMessage,
          liveInstruction: beat.liveInstruction,
          error: stringifyFailure(error),
        },
      });
      break;
    }
  }

  const browserSteps = input.browserExecutor ? (scenario.browserSteps ?? []) : [];
  for (const [browserIndex, browserStep] of browserSteps.entries()) {
    const stepStartedAt = new Date().toISOString();
    await writeTranscript(`BROWSER STEP: ${browserStep.action} ${browserStep.path}`);
    const executorResult = input.browserExecutor
      ? await input.browserExecutor({ step: browserStep, notebookId: seeded.notebookId, scenario })
      : {
          status: "skipped" as const,
          message: "No browser executor was provided.",
          screenshotRefs: browserStep.screenshotRef ? [browserStep.screenshotRef] : [],
          evidenceRefs: [],
        };
    const screenshotRefs = executorResult.screenshotRefs ?? (browserStep.screenshotRef ? [browserStep.screenshotRef] : []);
    scenarioScreenshotRefs.push(...screenshotRefs);
    const browserAssertions = browserStep.assertionRefs.map((ref) => ({
      id: ref.refId,
      category: "browser" as const,
      description: ref.label ?? ref.refId.replaceAll("_", " "),
      status: executorResult.status,
      passed: executorResult.status === "passed",
      ...(executorResult.status === "failed" ? { failureMessage: executorResult.message } : {}),
      evidenceRefs: uniqueNodeRefs([...(executorResult.evidenceRefs ?? []), ...screenshotRefs]),
      details: {
        action: browserStep.action,
        target: browserStep.target,
        path: browserStep.path,
        expectedText: browserStep.expectedText,
        absentText: browserStep.absentText,
      },
    }));
    for (const assertion of browserAssertions) {
      assertionResultsById.set(assertion.id, assertion);
    }
    if (executorResult.status === "failed") {
      finalStatus = "failed";
      finalSummary = executorResult.message;
    } else if (executorResult.status === "skipped" && finalStatus === "passed") {
      finalStatus = "skipped";
      finalSummary = executorResult.message;
    }
    await writeTranscript(`BROWSER ${executorResult.status.toUpperCase()}: ${executorResult.message}`);
    steps.push({
      id: `${scenario.id}_browser_${browserIndex + 1}`,
      stepIndex: steps.length,
      kind: "browser",
      status: executorResult.status,
      startedAt: stepStartedAt,
      completedAt: input.completedAt ?? new Date().toISOString(),
      toolEvents: [],
      runtimeEvents: [],
      assertions: browserAssertions,
      artifactRefs: [],
      screenshotRefs,
      traceRefs: uniqueNodeRefs([...scenarioTraceRefs, ...(executorResult.evidenceRefs ?? [])]),
      details: {
        browserStep,
        message: executorResult.message,
      },
    });
  }

  completedAt = completedAt ?? new Date().toISOString();
  const finalAssertions = evaluateSyntheticLearnerAssertions({
    assertionRefs: scenario.assertionRefs,
    transcript,
    tutorMessages: steps.map((step) => step.tutorMessage).filter((message): message is string => Boolean(message)),
    toolEvents: steps.flatMap((step) => step.toolEvents ?? []),
    runtimeEvents: steps.flatMap((step) => step.runtimeEvents ?? []),
    notebookEvents: allNotebookEvents,
    traceRefs: uniqueNodeRefs(scenarioTraceRefs),
    notebookRefs: [seededNotebookRef],
    ...(input.persistenceEvidence ? { persistence: input.persistenceEvidence } : {}),
  });
  for (const assertion of finalAssertions) {
    assertionResultsById.set(assertion.id, assertion);
  }
  const scenarioAssertions = [...assertionResultsById.values()];
  const rubricResults = input.rubricResults ?? [];
  for (const rubricResult of rubricResults) {
    await writeTranscript(`RUBRIC ${rubricResult.status.toUpperCase()}: ${rubricResult.rubricId} - ${rubricResult.summary}`);
  }
  const scenarioAssertionStatus = summarizeAssertionStatuses(scenarioAssertions);
  if (scenarioAssertionStatus.status === "failed") {
    finalStatus = "failed";
    finalSummary = scenarioAssertionStatus.summary;
  } else if (scenarioAssertionStatus.status === "skipped" && finalStatus === "passed") {
    finalStatus = "skipped";
    finalSummary = scenarioAssertionStatus.summary;
  }
  await writeTranscript(`FINAL: ${finalStatus} - ${finalSummary}`);

  const scenarioRun = {
    id: `${runId}_${scenario.id}`,
    runId,
    fixtureManifestId: input.matrix.fixture.id,
    fixtureVersion: input.matrix.fixture.version,
    personaId: persona.id,
    scenarioId: scenario.id,
    seededNotebookId: seeded.notebookId,
    status: finalStatus,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    steps,
    assertions: scenarioAssertions,
    artifactRefs: [],
    screenshotRefs: uniqueNodeRefs(scenarioScreenshotRefs),
    traceRefs: uniqueNodeRefs(scenarioTraceRefs),
    notebookRefs: [seeded.notebookRef ?? { refType: "notebook", refId: seeded.notebookId }],
    runKind: scenario.runKind,
    learnerMode,
    ...(input.simulatorModelConfig ? { simulatorModel: input.simulatorModelConfig } : {}),
    ...(input.autonomyStartProfile ? { autonomyStartProfile: input.autonomyStartProfile } : {}),
    gatingPolicy,
    actionRepairAttempts: 0,
    simulatorEvidence: [],
    issueCandidates: [],
    rubricResults,
    finalState: {
      passed: finalStatus === "passed",
      summary: finalSummary,
    },
  } satisfies SyntheticLearnerEvalScenarioRun;

  const runRecord = buildSyntheticLearnerEvalRunRecord({
    matrix: input.matrix,
    scenarioRuns: [scenarioRun],
    runId,
    startedAt,
    completedAt,
    notebookRefs: scenarioRun.notebookRefs,
    transcript,
    rubricResults,
  });

  return {
    matrix: input.matrix,
    scenario,
    scenarioRun,
    runRecord,
    transcript,
  };
}

function shouldStopScenarioAfterBeat(
  scenarioStopConditions: string[],
  beatStopConditions: string[],
  runtimeEvents: SyntheticLearnerRuntimeEvent[],
  toolEvents: SyntheticLearnerToolEvent[],
): boolean {
  const stopConditions = new Set([...scenarioStopConditions, ...beatStopConditions]);
  if (
    stopConditions.has("artifact_delivered") &&
    (runtimeEvents.some((event) => event.eventType.startsWith("artifact.")) ||
      toolEvents.some((event) => event.toolName.startsWith("artifact.") && event.label === "completed"))
  ) {
    return true;
  }
  return false;
}

async function resolveBeatLearnerMessage(input: {
  learnerMode: SyntheticLearnerMode;
  model?: SyntheticLearnerModelClient;
  modelConfig?: SyntheticLearnerModelConfig;
  fixture: EvalSourceFixtureManifest;
  persona: SyntheticLearnerPersona;
  scenario: SyntheticLearnerScenario;
  beatIndex: number;
  transcript: string[];
}): Promise<string> {
  const beat = input.scenario.beats[input.beatIndex];
  if (!beat) {
    throw new Error(`No scenario beat found at index ${input.beatIndex}.`);
  }
  if (input.learnerMode === "scripted") {
    return beat.scriptedMessage;
  }
  if (input.learnerMode !== "beat_llm") {
    throw new Error(`${input.learnerMode} is not implemented for beat-driven scenario execution yet.`);
  }
  if (!input.model) {
    throw new Error("LLM learner mode requires a Synthetic Learner model client.");
  }

  const actionDecision = syntheticLearnerActionDecisionSchema.parse(
    await input.model.generateActionDecision({
      prompt: renderBeatLearnerPrompt(input),
      learnerMode: input.learnerMode,
    }),
  );
  if (actionDecision.action !== "chat.respond" || !actionDecision.learnerMessage) {
    throw new Error(`beat_llm expected chat.respond but received ${actionDecision.action}.`);
  }
  return actionDecision.learnerMessage;
}

async function runAutonomousLearnerScenario(input: RunSyntheticLearnerEvalScenarioInput & {
  scenario: SyntheticLearnerScenario;
  persona: SyntheticLearnerPersona;
  seeded: SyntheticLearnerEvalSeedResult;
  transcript: string[];
  writeTranscript: (line: string) => Promise<void>;
  startedAt: string;
  runId: string;
  learnerMode: "scenario_autonomous_llm" | "full_autonomous_llm";
  gatingPolicy: SyntheticLearnerGatingPolicy;
}): Promise<RunSyntheticLearnerEvalScenarioResult> {
  if (!input.syntheticLearnerModel) {
    throw new Error("LLM learner mode requires a Synthetic Learner model client.");
  }
  if (!input.simulatorActions) {
    throw new Error("Autonomous LLM learner mode requires typed simulator actions.");
  }

  const seededNotebookRef: NodeRef = input.seeded.notebookRef ?? { refType: "notebook", refId: input.seeded.notebookId };
  const steps: SyntheticLearnerEvalScenarioRun["steps"] = [];
  const assertionResultsById = new Map<string, SyntheticLearnerAssertion>();
  const scenarioTraceRefs: NodeRef[] = uniqueNodeRefs([seededNotebookRef, ...(input.seeded.traceRefs ?? [])]);
  const simulatorEvidence: NonNullable<SyntheticLearnerEvalScenarioRun["simulatorEvidence"]> = [];
  const tutorMessages: string[] = [];
  const toolEvents: SyntheticLearnerToolEvent[] = [];
  const runtimeEvents: SyntheticLearnerRuntimeEvent[] = [];
  const notebookEvents: SyntheticLearnerRuntimeEvent[] = [];
  const observations: SyntheticLearnerActionObservation[] = [];
  let finalStatus: SyntheticLearnerEvalScenarioRun["status"] = "passed";
  let finalSummary = "Autonomous learner finished cleanly.";
  let actionRepairAttempts = 0;
  const maxTurns = input.learnerMode === "full_autonomous_llm"
    ? input.scenario.autonomousConfig?.maxTurns ?? input.scenario.maxTurns
    : input.scenario.maxTurns;

  for (let turnIndex = 0; turnIndex < maxTurns; turnIndex += 1) {
    const stepStartedAt = new Date().toISOString();
    const prompt = renderAutonomousActionPrompt({
      fixture: input.matrix.fixture,
      persona: input.persona,
      scenario: input.scenario,
      learnerMode: input.learnerMode,
      turnIndex,
      maxTurns,
      transcript: input.transcript,
      observations,
      ...(input.autonomyStartProfile ? { autonomyStartProfile: input.autonomyStartProfile } : {}),
    });
    const decisionResult = await generateActionDecisionWithRepair({
      model: input.syntheticLearnerModel,
      learnerMode: input.learnerMode,
      prompt,
      maxRepairAttempts: input.simulatorModelConfig?.maxActionRepairAttempts ?? 2,
    });
    actionRepairAttempts += decisionResult.repairAttempts;
    simulatorEvidence.push(...decisionResult.evidence);
    if (!decisionResult.decision) {
      finalStatus = "failed";
      finalSummary = "Synthetic Learner action repair attempts were exhausted.";
      break;
    }

    const decision = decisionResult.decision;
    await input.writeTranscript(`SIMULATOR ACTION: ${decision.action}`);
    const observation = await input.simulatorActions.execute({
      notebookId: input.seeded.notebookId,
      scenario: input.scenario,
      decision,
    });
    observations.push(observation);
    await input.writeTranscript(`SIMULATOR OBSERVATION: ${observation.status} - ${observation.summary}`);

    if (decision.action === "session.finish" || observation.status === "finished") {
      finalSummary = decision.finishReason ?? observation.summary;
      steps.push({
        id: `${input.scenario.id}_autonomous_${turnIndex + 1}`,
        stepIndex: turnIndex,
        kind: "summary",
        status: observation.status === "failed" ? "failed" : "passed",
        startedAt: stepStartedAt,
        completedAt: input.completedAt ?? new Date().toISOString(),
        toolEvents: [],
        runtimeEvents: [],
        assertions: [],
        artifactRefs: observation.evidenceRefs.filter((ref) => ref.refType === "artifact"),
        screenshotRefs: [],
        traceRefs: uniqueNodeRefs([...scenarioTraceRefs, ...observation.evidenceRefs]),
        details: { action: decision, observation },
      });
      break;
    }

    const response = await input.syntheticLearnerModel.generateLearnerResponse({
      prompt: renderAutonomousResponsePrompt({
        persona: input.persona,
        scenario: input.scenario,
        learnerMode: input.learnerMode,
        observation,
        transcript: input.transcript,
      }),
      learnerMode: input.learnerMode,
      observation,
    });
    const parsedResponse = parseLearnerResponse(response);
    if (parsedResponse.finish) {
      finalSummary = parsedResponse.finishReason ?? "Synthetic Learner finished.";
      break;
    }
    if (!parsedResponse.learnerFacingText) {
      finalStatus = "failed";
      finalSummary = "Synthetic Learner response did not include learner-facing text.";
      break;
    }

    await input.writeTranscript(`STUDENT: ${parsedResponse.learnerFacingText}`);
    const turn = await input.api.sendTutorTurn({
      notebookId: input.seeded.notebookId,
      scenario: input.scenario,
      scriptedMessage: parsedResponse.learnerFacingText,
      turnIndex,
    });
    tutorMessages.push(turn.assistantMessage);
    for (const event of turn.events) {
      if (event.source === "tutor" && (event.eventType === "TOOL_CALL_COMPLETE" || event.eventType === "TOOL_CALL_END" || event.eventType === "tool_call_complete")) {
        toolEvents.push({
          label: "completed",
          toolName: typeof event.payload.toolName === "string" ? event.payload.toolName : "unknown_tool",
          nodeRefs: [],
        });
      }
      if (event.source === "runtime") {
        runtimeEvents.push({
          eventType: event.eventType,
          payload: event.payload,
          timestamp: typeof event.payload.timestamp === "string" ? event.payload.timestamp : new Date().toISOString(),
        });
      }
      if (event.source === "notebook") {
        notebookEvents.push({
          eventType: event.eventType,
          payload: event.payload,
          timestamp: typeof event.payload.timestamp === "string" ? event.payload.timestamp : new Date().toISOString(),
        });
      }
    }
    await input.writeTranscript(`TUTOR COMPLETE: ${turn.assistantMessage}`);
    steps.push({
      id: `${input.scenario.id}_autonomous_${turnIndex + 1}`,
      stepIndex: turnIndex,
      kind: "prompt",
      status: "passed",
      startedAt: stepStartedAt,
      completedAt: input.completedAt ?? new Date().toISOString(),
      studentMessage: parsedResponse.learnerFacingText,
      tutorMessage: turn.assistantMessage,
      toolEvents: [],
      runtimeEvents: [],
      assertions: [],
      artifactRefs: observation.evidenceRefs.filter((ref) => ref.refType === "artifact"),
      screenshotRefs: [],
      traceRefs: uniqueNodeRefs([...scenarioTraceRefs, ...(turn.traceRefs ?? []), ...observation.evidenceRefs]),
      details: { action: decision, observation },
    });
  }

  if (!steps.length && finalStatus === "passed") {
    finalStatus = "skipped";
    finalSummary = "Autonomous learner did not execute any steps.";
  }

  const finalAssertionRefs = input.learnerMode === "full_autonomous_llm"
    ? input.scenario.autonomousConfig?.invariantAssertionRefs ?? [{ refType: "assertion" as const, refId: "learner_visible_no_id_leak" }]
    : input.scenario.assertionRefs;
  const finalAssertions = evaluateSyntheticLearnerAssertions({
    assertionRefs: finalAssertionRefs,
    transcript: input.transcript,
    tutorMessages,
    toolEvents,
    runtimeEvents,
    notebookEvents,
    traceRefs: scenarioTraceRefs,
    notebookRefs: [seededNotebookRef],
    ...(input.persistenceEvidence ? { persistence: input.persistenceEvidence } : {}),
  });
  for (const assertion of finalAssertions) {
    assertionResultsById.set(assertion.id, assertion);
  }
  const scenarioAssertions = [...assertionResultsById.values()];
  const scenarioAssertionStatus = summarizeAssertionStatuses(scenarioAssertions);
  if (scenarioAssertionStatus.status === "failed") {
    finalStatus = "failed";
    finalSummary = scenarioAssertionStatus.summary;
  }

  await input.writeTranscript(`FINAL: ${finalStatus} - ${finalSummary}`);
  const completedAt = input.completedAt ?? new Date().toISOString();
  const scenarioRun = {
    id: `${input.runId}_${input.scenario.id}`,
    runId: input.runId,
    fixtureManifestId: input.matrix.fixture.id,
    fixtureVersion: input.matrix.fixture.version,
    personaId: input.persona.id,
    scenarioId: input.scenario.id,
    seededNotebookId: input.seeded.notebookId,
    status: finalStatus,
    startedAt: input.startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(input.startedAt)),
    steps,
    assertions: scenarioAssertions,
    artifactRefs: uniqueNodeRefs(steps.flatMap((step) => step.artifactRefs ?? [])),
    screenshotRefs: [],
    traceRefs: scenarioTraceRefs,
    notebookRefs: [seededNotebookRef],
    runKind: input.scenario.runKind,
    learnerMode: input.learnerMode,
    ...(input.simulatorModelConfig ? { simulatorModel: input.simulatorModelConfig } : {}),
    ...(input.autonomyStartProfile ? { autonomyStartProfile: input.autonomyStartProfile } : {}),
    gatingPolicy: input.gatingPolicy,
    actionRepairAttempts,
    simulatorEvidence,
    issueCandidates: finalStatus === "failed"
      ? [buildIssueCandidate({ ...input, finalSummary, evidenceRefs: scenarioTraceRefs })]
      : [],
    rubricResults: input.rubricResults ?? [],
    finalState: {
      passed: finalStatus === "passed",
      summary: finalSummary,
    },
  } satisfies SyntheticLearnerEvalScenarioRun;

  const runRecord = buildSyntheticLearnerEvalRunRecord({
    matrix: input.matrix,
    scenarioRuns: [scenarioRun],
    runId: input.runId,
    startedAt: input.startedAt,
    completedAt,
    notebookRefs: scenarioRun.notebookRefs,
    transcript: input.transcript,
    rubricResults: input.rubricResults ?? [],
  });

  return {
    matrix: input.matrix,
    scenario: input.scenario,
    scenarioRun,
    runRecord,
    transcript: input.transcript,
  };
}

function parseLearnerResponse(response: unknown): SyntheticLearnerLearnerResponse {
  const schema = {
    parse(value: unknown): SyntheticLearnerLearnerResponse {
      if (!value || typeof value !== "object") throw new Error("Synthetic Learner response must be an object.");
      const candidate = value as SyntheticLearnerLearnerResponse;
      if (!candidate.finish && !candidate.learnerFacingText) {
        throw new Error("Synthetic Learner response must include learner-facing text unless finish is true.");
      }
      return {
        finish: candidate.finish ?? false,
        ...(candidate.learnerFacingText ? { learnerFacingText: candidate.learnerFacingText } : {}),
        ...(candidate.finishReason ? { finishReason: candidate.finishReason } : {}),
        ...(candidate.internalRationale ? { internalRationale: candidate.internalRationale } : {}),
      };
    },
  };
  return schema.parse(response);
}

async function generateActionDecisionWithRepair(input: {
  model: SyntheticLearnerModelClient;
  learnerMode: SyntheticLearnerMode;
  prompt: string;
  maxRepairAttempts: number;
}): Promise<{
  decision?: SyntheticLearnerActionDecision;
  repairAttempts: number;
  evidence: NonNullable<SyntheticLearnerEvalScenarioRun["simulatorEvidence"]>;
}> {
  const evidence: NonNullable<SyntheticLearnerEvalScenarioRun["simulatorEvidence"]> = [];
  let repairFeedback: string | undefined;
  for (let attempt = 0; attempt <= input.maxRepairAttempts; attempt += 1) {
    const raw = await input.model.generateActionDecision({
      prompt: input.prompt,
      learnerMode: input.learnerMode,
      ...(repairFeedback ? { repairFeedback } : {}),
    });
    const parsed = syntheticLearnerActionDecisionSchema.safeParse(raw);
    if (parsed.success) {
      return { decision: parsed.data, repairAttempts: attempt, evidence };
    }
    repairFeedback = parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
    evidence.push({
      eventType: attempt < input.maxRepairAttempts ? "action_repaired" : "model_output_invalid",
      learnerMode: input.learnerMode,
      message: repairFeedback,
      rawModelOutput: JSON.stringify(raw),
      repairAttempt: attempt + 1,
      schemaFeedback: repairFeedback,
      timestamp: new Date().toISOString(),
    });
  }
  return { repairAttempts: input.maxRepairAttempts, evidence };
}

function renderAutonomousActionPrompt(input: {
  fixture: EvalSourceFixtureManifest;
  persona: SyntheticLearnerPersona;
  scenario: SyntheticLearnerScenario;
  learnerMode: SyntheticLearnerMode;
  autonomyStartProfile?: SyntheticLearnerAutonomyStartProfile;
  turnIndex: number;
  maxTurns: number;
  transcript: string[];
  observations: SyntheticLearnerActionObservation[];
}): string {
  const startContext = input.autonomyStartProfile === "oriented_entry"
    ? `Learner-visible source summary: topics=${formatSyntheticLearnerList(input.fixture.expectedTopics, ", ")}; concepts=${formatSyntheticLearnerList(input.fixture.expectedConcepts, ", ")}`
    : "Start with persona state and notebook goal only.";
  return [
    "Choose the next Synthetic Learner action.",
    `Learner mode: ${input.learnerMode}`,
    `Start profile: ${input.autonomyStartProfile ?? "scenario_envelope"}`,
    startContext,
    `Persona: ${input.persona.name}`,
    `Goal: ${input.persona.goalSummary}`,
    `Scenario: ${input.scenario.name}`,
    `Turn budget: ${input.maxTurns - input.turnIndex}/${input.maxTurns}`,
    `Allowed simulator actions: chat.respond, artifact.list, artifact.view, quiz.answer, artifact.feedback, session.finish`,
    `Scenario allowed actions: ${formatSyntheticLearnerList(input.scenario.allowedActions, ", ")}`,
    `Stop conditions: ${formatSyntheticLearnerList(input.scenario.stopConditions, ", ")}`,
    "Recent observations:",
    ...input.observations.slice(-5).map((observation) => `${observation.action}: ${observation.status} - ${observation.summary}`),
    "Recent transcript:",
    ...input.transcript.slice(-8).filter((line) => !line.startsWith("ASSERTIONS:")),
    "Return structured JSON for one action. Do not include hidden eval refs, expected outcomes, database IDs, or traces.",
  ].join("\n");
}

function renderAutonomousResponsePrompt(input: {
  persona: SyntheticLearnerPersona;
  scenario: SyntheticLearnerScenario;
  learnerMode: SyntheticLearnerMode;
  observation: SyntheticLearnerActionObservation;
  transcript: string[];
}): string {
  return [
    "Write the learner-facing student response after the simulator observation.",
    `Learner mode: ${input.learnerMode}`,
    `Persona: ${input.persona.name}`,
    `Scenario: ${input.scenario.name}`,
    `Observation: ${input.observation.status} - ${input.observation.summary}`,
    "Recent transcript:",
    ...input.transcript.slice(-8).filter((line) => !line.startsWith("ASSERTIONS:")),
    "Return JSON matching { learnerFacingText?: string, finish?: boolean, finishReason?: string, internalRationale?: string }.",
  ].join("\n");
}

function buildIssueCandidate(input: RunSyntheticLearnerEvalScenarioInput & {
  scenario: SyntheticLearnerScenario;
  persona: SyntheticLearnerPersona;
  seeded: SyntheticLearnerEvalSeedResult;
  learnerMode: SyntheticLearnerMode;
  finalSummary: string;
  evidenceRefs: NodeRef[];
  transcript: string[];
}) {
  return {
    title: `Synthetic Learner failure: ${input.scenario.name}`,
    severity: "medium" as const,
    learnerMode: input.learnerMode,
    runKind: input.scenario.runKind,
    personaId: input.persona.id,
    scenarioId: input.scenario.id,
    ...(input.autonomyStartProfile ? { autonomyStartProfile: input.autonomyStartProfile } : {}),
    fixtureManifestId: input.matrix.fixture.id,
    fixtureVersion: input.matrix.fixture.version,
    seededNotebookId: input.seeded.notebookId,
    failureSummary: input.finalSummary,
    transcriptExcerpt: input.transcript.slice(-8).length ? input.transcript.slice(-8) : [input.finalSummary],
    evidenceRefs: input.evidenceRefs,
    traceRefs: input.evidenceRefs.filter((ref) => ref.refType === "session"),
    artifactRefs: input.evidenceRefs.filter((ref) => ref.refType === "artifact"),
    reproductionCommand: `pnpm --filter @studyagent/worker synthetic-learner-evals -- --learner-mode=${input.learnerMode} --scenario=${input.scenario.id} --persona=${input.persona.id}`,
  };
}

function renderBeatLearnerPrompt(input: {
  learnerMode: SyntheticLearnerMode;
  modelConfig?: SyntheticLearnerModelConfig;
  fixture: EvalSourceFixtureManifest;
  persona: SyntheticLearnerPersona;
  scenario: SyntheticLearnerScenario;
  beatIndex: number;
  transcript: string[];
}): string {
  const beat = input.scenario.beats[input.beatIndex];
  if (!beat) {
    throw new Error(`No scenario beat found at index ${input.beatIndex}.`);
  }

  return [
    "You are a Synthetic Learner in a StudyAgent eval.",
    `Learner mode: ${input.learnerMode}`,
    `Simulator model: ${input.modelConfig?.model ?? "unspecified"}`,
    `Fixture: ${input.fixture.id} (${input.fixture.version})`,
    `Persona: ${input.persona.name}`,
    `Goal: ${input.persona.goalSummary}`,
    `Background: ${input.persona.backgroundSummary}`,
    `Learner level: ${input.persona.learnerLevel}`,
    `Trait archetype: ${input.persona.traitArchetypeId}`,
    `Trait values: ${JSON.stringify(input.persona.traitValues)}`,
    `Behaviors: ${formatSyntheticLearnerList(input.persona.behaviors, "; ")}`,
    `Misconceptions: ${formatSyntheticLearnerList(input.persona.misconceptions, "; ")}`,
    `Response policy: tone=${input.persona.responsePolicy.tone}; brevity=${input.persona.responsePolicy.brevity}; constraints=${formatSyntheticLearnerList(input.persona.responsePolicy.constraints, "; ")}`,
    `Scenario: ${input.scenario.name}`,
    `Entry prompt: ${input.scenario.entryPrompt}`,
    `Remaining turns: ${Math.max(0, input.scenario.maxTurns - input.beatIndex)}`,
    `Allowed actions: ${formatSyntheticLearnerList(beat.allowedActions, ", ")}`,
    `Stop conditions: ${formatSyntheticLearnerList(beat.stopConditions, ", ")}`,
    `Beat instruction: ${beat.liveInstruction}`,
    "Recent transcript:",
    ...input.transcript.slice(-8).filter((line) => !line.startsWith("ASSERTIONS:")),
    "Return JSON matching { action: 'chat.respond', rationale: string, learnerMessage: string }.",
  ].join("\n");
}

export async function runSyntheticLearnerEvalSuite(
  input: RunSyntheticLearnerEvalSuiteInput,
): Promise<RunSyntheticLearnerEvalSuiteResult> {
  const runId =
    input.runId ??
    `slrun_${input.matrix.fixture.id}_${input.matrix.personas.length}x${input.matrix.scenarios.length}_${crypto.randomUUID().slice(0, 8)}`;
  const transcript: string[] = [];
  const writeTranscript = async (line: string): Promise<void> => {
    transcript.push(line);
    await input.writeTranscript?.(line);
  };

  const selectedRuns = input.matrix.runs.filter((plannedRun) => {
    const personaAllowed = !input.personaIds?.length || input.personaIds.includes(plannedRun.personaId);
    const scenarioAllowed = !input.scenarioIds?.length || input.scenarioIds.includes(plannedRun.scenarioId);
    return personaAllowed && scenarioAllowed;
  });

  if (!selectedRuns.length) {
    throw new Error("Synthetic learner eval suite does not contain any selected runs.");
  }

  const startedAt = input.startedAt ?? new Date().toISOString();
  const scenarioRuns: SyntheticLearnerEvalScenarioRun[] = [];
  const notebookRefs: NodeRef[] = [];

  await writeTranscript(`RUN STARTED: ${runId}`);
  await writeTranscript(`SCENARIO COUNT: ${selectedRuns.length}`);

  for (const plannedRun of selectedRuns) {
    await writeTranscript(`SUITE SCENARIO START: ${plannedRun.personaId} / ${plannedRun.scenarioId}`);
    const scenarioStartedAt = new Date().toISOString();
    const scenarioResult = await runSyntheticLearnerEvalScenario({
      matrix: input.matrix,
      scenarioId: plannedRun.scenarioId,
      personaId: plannedRun.personaId,
      api: input.api,
      writeTranscript,
      startedAt: scenarioStartedAt,
      runId: `${runId}_${plannedRun.personaId}`,
      ...(input.persistenceEvidence ? { persistenceEvidence: input.persistenceEvidence } : {}),
      ...(input.browserExecutor ? { browserExecutor: input.browserExecutor } : {}),
      ...(input.rubricResults ? { rubricResults: input.rubricResults } : {}),
      ...(input.learnerMode ? { learnerMode: input.learnerMode } : {}),
      ...(input.simulatorModelConfig ? { simulatorModelConfig: input.simulatorModelConfig } : {}),
      ...(input.syntheticLearnerModel ? { syntheticLearnerModel: input.syntheticLearnerModel } : {}),
      ...(input.simulatorActions ? { simulatorActions: input.simulatorActions } : {}),
      ...(input.autonomyStartProfile ? { autonomyStartProfile: input.autonomyStartProfile } : {}),
      ...(input.gatingPolicy ? { gatingPolicy: input.gatingPolicy } : {}),
    });
    scenarioRuns.push(scenarioResult.scenarioRun);
    notebookRefs.push(...scenarioResult.scenarioRun.notebookRefs);
    await writeTranscript(`SUITE SCENARIO END: ${plannedRun.personaId} / ${plannedRun.scenarioId} => ${scenarioResult.scenarioRun.status}`);
  }

  const completedAt = input.completedAt ?? new Date().toISOString();
  const draftRunRecord = buildSyntheticLearnerEvalRunRecord({
    matrix: input.matrix,
    scenarioRuns,
    runId,
    startedAt,
    completedAt,
    notebookRefs,
    transcript,
  });

  await writeTranscript(`FINAL: ${draftRunRecord.status} - ${summarizeSuiteStatus(scenarioRuns)}`);
  const runRecord = buildSyntheticLearnerEvalRunRecord({
    matrix: input.matrix,
    scenarioRuns,
    runId,
    startedAt,
    completedAt,
    notebookRefs,
    transcript,
  });

  return {
    matrix: input.matrix,
    scenarioRuns,
    runRecord,
    transcript,
  };
}

export function createSyntheticLearnerTriggerAdapter(): SyntheticLearnerTriggerAdapter {
  return {
    async invoke(input) {
      return runSyntheticLearnerEvalSuite({
        ...input,
        ...(input.triggerRunId ? { runId: `slrun_trigger_${input.triggerRunId}` } : {}),
      });
    },
  };
}

function uniqueNodeRefs(refs: NodeRef[]): NodeRef[] {
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

function stringifyFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Tutor stream failed";
}

function summarizeAssertionStatuses(assertions: SyntheticLearnerAssertion[]): {
  status: SyntheticLearnerEvalScenarioRun["status"];
  summary: string;
} {
  if (!assertions.length) {
    return { status: "skipped", summary: "No assertions were evaluated." };
  }

  const failedAssertion = assertions.find((assertion) => assertion.status === "failed");
  if (failedAssertion) {
    return {
      status: "failed",
      summary: failedAssertion.failureMessage ?? failedAssertion.description,
    };
  }

  const passedCount = assertions.filter((assertion) => assertion.status === "passed").length;
  if (passedCount > 0) {
    return { status: "passed", summary: "Deterministic assertions passed." };
  }

  return {
    status: "skipped",
    summary: "Deterministic assertions were skipped because the required evidence was unavailable.",
  };
}

function summarizeSuiteStatus(scenarioRuns: SyntheticLearnerEvalScenarioRun[]): string {
  if (!scenarioRuns.length) return "No scenario runs were executed.";
  const failedCount = scenarioRuns.filter((run) => run.status === "failed").length;
  if (failedCount > 0) {
    return `${failedCount} scenario run${failedCount === 1 ? "" : "s"} failed.`;
  }
  const skippedCount = scenarioRuns.filter((run) => run.status === "skipped").length;
  if (skippedCount > 0) {
    return `${skippedCount} scenario run${skippedCount === 1 ? "" : "s"} were skipped.`;
  }
  return `All ${scenarioRuns.length} scenario runs passed.`;
}
