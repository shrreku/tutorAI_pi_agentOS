import type { NodeRef } from "./ids.js";
import {
  buildSyntheticLearnerEvalMatrix,
  buildSyntheticLearnerEvalRunRecord,
  formatSyntheticLearnerList,
  type EvalSourceFixtureManifest,
  type SyntheticLearnerAssertion,
  type SyntheticLearnerEvalMatrix,
  type SyntheticLearnerEvalRunRecord,
  type SyntheticLearnerEvalScenarioRun,
  type SyntheticLearnerScenario,
  type SyntheticLearnerToolEvent,
  type SyntheticLearnerRuntimeEvent,
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

export type SyntheticLearnerEvalTranscriptWriter = (line: string) => void | Promise<void>;

export type RunSyntheticLearnerEvalScenarioInput = {
  matrix: SyntheticLearnerEvalMatrix;
  scenarioId?: string;
  personaId?: string;
  api: SyntheticLearnerEvalRunnerApi;
  writeTranscript?: SyntheticLearnerEvalTranscriptWriter;
  persistenceEvidence?: SyntheticLearnerAssertionPersistenceEvidence;
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
  const runId = input.runId ?? `slrun_${input.matrix.fixture.id}_${persona.id}_${scenario.id}`;

  await writeTranscript(`RUN STARTED: ${runId}`);
  await writeTranscript(`SCENARIO: ${scenario.name}`);
  await writeTranscript(`PERSONA: ${persona.name}`);
  await writeTranscript(`ASSERTIONS: ${formatSyntheticLearnerList(scenario.assertionRefs.map((ref) => ref.refId), ", ")}`);

  const seeded = await input.api.seedNotebook({
    fixture: input.matrix.fixture,
    persona: { id: persona.id, name: persona.name },
    scenario,
  });

  await writeTranscript(`NOTEBOOK SEEDED: ${seeded.notebookId}`);

  const steps: SyntheticLearnerEvalScenarioRun["steps"] = [];
  const seededNotebookRef: NodeRef = seeded.notebookRef ?? { refType: "notebook", refId: seeded.notebookId };
  let scenarioTraceRefs: NodeRef[] = [
    seededNotebookRef,
    ...(seeded.traceRefs ?? []),
  ];
  const allNotebookEvents: SyntheticLearnerRuntimeEvent[] = [];
  const assertionResultsById = new Map<string, SyntheticLearnerAssertion>();

  let finalStatus: SyntheticLearnerEvalScenarioRun["status"] = "passed";
  let finalSummary = "Scenario completed cleanly.";
  let completedAt = input.completedAt;

  for (const [index, beat] of scenario.beats.entries()) {
    const beatStartedAt = new Date().toISOString();
    const stepId = `${scenario.id}_step_${index + 1}`;
    const stepTranscriptStart = transcript.length;
    let stepAssertions: SyntheticLearnerAssertion[] = [];

    await writeTranscript(`STUDENT: ${beat.scriptedMessage}`);

    try {
      const turn = await input.api.sendTutorTurn({
        notebookId: seeded.notebookId,
        scenario,
        scriptedMessage: beat.scriptedMessage,
        turnIndex: index,
      });

      const toolEvents: SyntheticLearnerToolEvent[] = [];
      const runtimeEvents: SyntheticLearnerRuntimeEvent[] = [];
      const stepNotebookEvents: SyntheticLearnerRuntimeEvent[] = [];
      const traceRefs: NodeRef[] = [...scenarioTraceRefs, ...(turn.traceRefs ?? [])];

      for (const event of [...turn.events, ...(turn.notebookEvents ?? [])]) {
        if (event.source === "tutor") {
          if (event.eventType === "TEXT_MESSAGE_CONTENT" && typeof event.payload.text === "string") {
            await writeTranscript(`TUTOR: ${event.payload.text}`);
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
          } else if (event.eventType === "TOOL_CALL_COMPLETE" || event.eventType === "tool_call_complete") {
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
        tutorMessage: turn.assistantMessage,
        toolEvents,
        runtimeEvents,
        assertions: stepAssertions,
        artifactRefs: [],
        traceRefs: uniqueNodeRefs(traceRefs),
        details: {
          beatId: beat.id,
          beatKind: beat.kind,
          scriptedMessage: beat.scriptedMessage,
          liveInstruction: beat.liveInstruction,
        },
      });

      scenarioTraceRefs = uniqueNodeRefs(traceRefs);
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
        studentMessage: beat.scriptedMessage,
        toolEvents: [],
        runtimeEvents: [],
        assertions: stepAssertions,
        artifactRefs: [],
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

  completedAt = completedAt ?? new Date().toISOString();
  const finalAssertions = evaluateSyntheticLearnerAssertions({
    assertionRefs: scenario.assertionRefs,
    transcript,
    tutorMessages: steps.map((step) => step.tutorMessage).filter((message): message is string => Boolean(message)),
    toolEvents: steps.flatMap((step) => step.toolEvents),
    runtimeEvents: steps.flatMap((step) => step.runtimeEvents),
    notebookEvents: allNotebookEvents,
    traceRefs: uniqueNodeRefs(scenarioTraceRefs),
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
    traceRefs: uniqueNodeRefs(scenarioTraceRefs),
    notebookRefs: [seeded.notebookRef ?? { refType: "notebook", refId: seeded.notebookId }],
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
  });

  return {
    matrix: input.matrix,
    scenario,
    scenarioRun,
    runRecord,
    transcript,
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
