import type {
  SyntheticLearnerEvalIssueCandidate,
  SyntheticLearnerEvalObservationEvent,
  SyntheticLearnerEvalScenarioRun,
  SyntheticLearnerRuntimeEvent,
  SyntheticLearnerRunStatus,
} from "@studyagent/schemas";

export function observationFromRuntimeEvent(input: {
  runId: string;
  scenarioRunId: string;
  event: SyntheticLearnerRuntimeEvent;
  index: number;
}): SyntheticLearnerEvalObservationEvent {
  return {
    id: `obs_${input.scenarioRunId}_runtime_${input.index + 1}`,
    runId: input.runId,
    scenarioRunId: input.scenarioRunId,
    timestamp: input.event.timestamp,
    kind: "runtime",
    message: input.event.eventType,
    payload: input.event.payload,
    evidenceRefs: [],
  };
}

export function observationFromIssueCandidate(input: {
  runId: string;
  scenarioRunId: string;
  candidate: SyntheticLearnerEvalIssueCandidate;
  index: number;
}): SyntheticLearnerEvalObservationEvent {
  return {
    id: `obs_${input.scenarioRunId}_issue_${input.index + 1}`,
    runId: input.runId,
    scenarioRunId: input.scenarioRunId,
    timestamp: new Date().toISOString(),
    kind: "issue_candidate",
    status: input.candidate.kind === "failure" ? "failed" : "passed",
    message: `${input.candidate.reason}: ${input.candidate.title}`,
    payload: { issueCandidate: input.candidate },
    evidenceRefs: input.candidate.evidenceRefs,
  };
}

export function observationForScenarioStart(input: {
  runId: string;
  scenarioRunId: string;
  scenarioId: string;
  personaId: string;
}): SyntheticLearnerEvalObservationEvent {
  return {
    id: `obs_${input.scenarioRunId}_scenario_start`,
    runId: input.runId,
    scenarioRunId: input.scenarioRunId,
    timestamp: new Date().toISOString(),
    kind: "run",
    status: "running",
    message: `Scenario ${input.scenarioId} started for persona ${input.personaId}.`,
    payload: { scenarioId: input.scenarioId, personaId: input.personaId },
    evidenceRefs: [],
  };
}

export function observationForFinalStatus(input: {
  runId: string;
  scenarioRunId: string;
  status: SyntheticLearnerEvalScenarioRun["status"];
  summary: string;
}): SyntheticLearnerEvalObservationEvent {
  return {
    id: `obs_${input.scenarioRunId}_final`,
    runId: input.runId,
    scenarioRunId: input.scenarioRunId,
    timestamp: new Date().toISOString(),
    kind: "run",
    status: input.status,
    message: `FINAL: ${input.status} - ${input.summary}`,
    payload: { summary: input.summary },
    evidenceRefs: [],
  };
}

export function observationForWarning(input: {
  runId: string;
  scenarioRunId: string;
  message: string;
  payload?: Record<string, unknown>;
}): SyntheticLearnerEvalObservationEvent {
  return {
    id: `obs_${input.scenarioRunId}_warning_${crypto.randomUUID().slice(0, 8)}`,
    runId: input.runId,
    scenarioRunId: input.scenarioRunId,
    timestamp: new Date().toISOString(),
    kind: "runtime",
    status: "running",
    message: input.message,
    payload: input.payload ?? {},
    evidenceRefs: [],
  };
}

export async function appendTurnStreamObservations(input: {
  runId: string;
  scenarioRunId: string;
  observationEvents: SyntheticLearnerEvalObservationEvent[];
  runtimeEvents: SyntheticLearnerRuntimeEvent[];
  notebookEvents: SyntheticLearnerRuntimeEvent[];
  writeObservation: (event: SyntheticLearnerEvalObservationEvent) => Promise<void>;
}): Promise<void> {
  for (const [index, event] of input.runtimeEvents.entries()) {
    const observationEvent = observationFromRuntimeEvent({
      runId: input.runId,
      scenarioRunId: input.scenarioRunId,
      event,
      index,
    });
    input.observationEvents.push(observationEvent);
    await input.writeObservation(observationEvent);
  }
  for (const [index, event] of input.notebookEvents.entries()) {
    const observationEvent = {
      id: `obs_${input.scenarioRunId}_notebook_${index + 1}`,
      runId: input.runId,
      scenarioRunId: input.scenarioRunId,
      timestamp: event.timestamp,
      kind: "notebook" as const,
      message: event.eventType,
      payload: event.payload,
      evidenceRefs: [],
    };
    input.observationEvents.push(observationEvent);
    await input.writeObservation(observationEvent);
  }
}

export async function appendStepObservations(input: {
  runId: string;
  scenarioRunId: string;
  step: SyntheticLearnerEvalScenarioRun["steps"][number];
  observationEvents: SyntheticLearnerEvalObservationEvent[];
  writeObservation: (event: SyntheticLearnerEvalObservationEvent) => Promise<void>;
}): Promise<void> {
  for (const observationEvent of observationsFromStep({
    runId: input.runId,
    scenarioRunId: input.scenarioRunId,
    step: input.step,
  })) {
    input.observationEvents.push(observationEvent);
    await input.writeObservation(observationEvent);
  }
}

function observationsFromStep(input: {
  runId: string;
  scenarioRunId: string;
  step: SyntheticLearnerEvalScenarioRun["steps"][number];
}): SyntheticLearnerEvalObservationEvent[] {
  const timestamp = input.step.completedAt ?? input.step.startedAt;
  const base = {
    runId: input.runId,
    scenarioRunId: input.scenarioRunId,
    timestamp,
  };
  const events: SyntheticLearnerEvalObservationEvent[] = [];
  if (input.step.studentMessage) {
    events.push({
      ...base,
      id: `obs_${input.step.id}_student`,
      kind: "student",
      message: input.step.studentMessage,
      payload: {},
      evidenceRefs: [],
    });
  }
  if (input.step.tutorMessage) {
    events.push({
      ...base,
      id: `obs_${input.step.id}_tutor`,
      kind: "tutor",
      message: input.step.tutorMessage,
      payload: {},
      evidenceRefs: input.step.traceRefs,
    });
  }
  for (const [index, toolEvent] of input.step.toolEvents.entries()) {
    events.push({
      ...base,
      id: `obs_${input.step.id}_tool_${index + 1}`,
      kind: "tool",
      message: `${toolEvent.label}: ${toolEvent.toolName}`,
      payload: { toolEvent },
      evidenceRefs: toolEvent.nodeRefs,
    });
  }
  for (const [index, assertion] of input.step.assertions.entries()) {
    events.push({
      ...base,
      id: `obs_${input.step.id}_assertion_${index + 1}`,
      kind: "assertion",
      status: assertion.status,
      message: `${assertion.id}: ${assertion.status}`,
      payload: { assertion },
      evidenceRefs: assertion.evidenceRefs,
    });
  }
  for (const [index, artifactRef] of input.step.artifactRefs.entries()) {
    events.push({
      ...base,
      id: `obs_${input.step.id}_artifact_${index + 1}`,
      kind: "artifact",
      message: `${artifactRef.refType}:${artifactRef.refId}`,
      payload: { artifactRef },
      evidenceRefs: [artifactRef],
    });
  }
  return events;
}
