import type { NodeRef } from "./ids.js";
import type {
  SyntheticLearnerAssertion,
  SyntheticLearnerAssertionReference,
  SyntheticLearnerAssertionStatus,
  SyntheticLearnerRuntimeEvent,
  SyntheticLearnerToolEvent,
} from "./synthetic-learner-evals.js";

export type SyntheticLearnerAssertionPersistenceEvidence = {
  masteryEvidence?: Array<{
    ref: NodeRef;
    correctnessLabel?: string;
    overallScore?: number;
    confidence?: number;
    triggerSource?: string;
  }>;
  artifacts?: Array<{
    ref: NodeRef;
    status: string;
  }>;
  sessionEvents?: Array<{
    ref?: NodeRef;
    eventType: string;
    timestamp?: string;
  }>;
};

export type SyntheticLearnerAssertionEngineInput = {
  assertionRefs: SyntheticLearnerAssertionReference[];
  transcript?: string[];
  tutorMessages?: string[];
  toolEvents?: SyntheticLearnerToolEvent[];
  runtimeEvents?: SyntheticLearnerRuntimeEvent[];
  notebookEvents?: SyntheticLearnerRuntimeEvent[];
  traceRefs?: NodeRef[];
  notebookRefs?: NodeRef[];
  persistence?: SyntheticLearnerAssertionPersistenceEvidence;
};

const ALLOWED_ARTIFACT_STATUSES = new Set(["proposed", "generating", "ready", "published", "archived", "failed", "discarded"]);
const DEBUG_NARRATION_PREFIXES = ["TOOL START:", "TOOL COMPLETE:", "RUNTIME:", "NOTEBOOK EVENT:", "ASSERTION pending:"];
const RAW_ID_MATCHERS = [
  /\b(?:nb|sess|turn|run|slrun|trace|artifact|source|chunk|concept|persona|scenario|fixture|obj|evt)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*\b/gi,
  /\b(?:turn|run|session|notebook|source|artifact|trace|objective|scenario|persona|fixture)\d+\b/gi,
  /\b[a-f0-9]{8,}\b/gi,
];

export function evaluateSyntheticLearnerAssertions(input: SyntheticLearnerAssertionEngineInput): SyntheticLearnerAssertion[] {
  return input.assertionRefs.map((ref) => evaluateSyntheticLearnerAssertion(ref, input));
}

export function evaluateSyntheticLearnerAssertion(
  ref: SyntheticLearnerAssertionReference,
  input: SyntheticLearnerAssertionEngineInput,
): SyntheticLearnerAssertion {
  const category = inferAssertionCategory(ref.refId);
  const evidenceRefs = collectEvidenceRefs(input);
  const transcript = input.transcript ?? [];
  const tutorMessages = input.tutorMessages ?? [];
  const runtimeEvents = input.runtimeEvents ?? [];
  const notebookEvents = input.notebookEvents ?? [];
  const toolEvents = input.toolEvents ?? [];
  const persistence = input.persistence;
  const textCorpus = [...transcript, ...tutorMessages];

  if (category === "learner_visible") {
    return evaluateLearnerVisibleAssertion(ref, tutorMessages, evidenceRefs);
  }

  if (category === "runtime") {
    return evaluateRuntimeAssertion(ref, textCorpus, runtimeEvents, notebookEvents, toolEvents, evidenceRefs);
  }

  if (category === "persistence") {
    return evaluatePersistenceAssertion(ref, runtimeEvents, persistence, evidenceRefs);
  }

  return buildAssertion({
    ref,
    status: "skipped",
    passed: false,
    failureMessage: `No deterministic rule is implemented for assertion ${ref.refId}.`,
    evidenceRefs,
    details: { reason: "unsupported_assertion" },
  });
}

function evaluateLearnerVisibleAssertion(
  ref: SyntheticLearnerAssertionReference,
  tutorMessages: string[],
  evidenceRefs: NodeRef[],
): SyntheticLearnerAssertion {
  if (ref.refId === "learner_visible_source_refs") {
    const sourceEvidenceRefs = evidenceRefs.filter((ref) => ref.refType === "source" || ref.refType === "chunk");
    if (!sourceEvidenceRefs.length) {
      return buildAssertion({
        ref,
        status: "skipped",
        passed: false,
        failureMessage: "No source or chunk references were provided in evidenceRefs.",
        evidenceRefs,
        details: { reason: "missing_source_refs" },
      });
    }

    return buildAssertion({
      ref,
      status: "passed",
      passed: true,
      evidenceRefs: sourceEvidenceRefs,
      details: {
        sourceRefCount: sourceEvidenceRefs.length,
        sourceRefs: sourceEvidenceRefs.map(describeRef),
      },
    });
  }

  if (!tutorMessages.length) {
    return buildAssertion({
      ref,
      status: "skipped",
      passed: false,
      failureMessage: "No learner-visible tutor text was provided.",
      evidenceRefs,
      details: { reason: "missing_text" },
    });
  }

  const flaggedFragments = collectFlaggedFragments(tutorMessages);
  if (flaggedFragments.length) {
    return buildAssertion({
      ref,
      status: "failed",
      passed: false,
      failureMessage: `Tutor text leaks machine-generated content: ${flaggedFragments.join("; ")}`,
      evidenceRefs,
      details: { flaggedFragments, checkedLines: tutorMessages.length },
    });
  }

  return buildAssertion({
    ref,
    status: "passed",
    passed: true,
    evidenceRefs,
    details: {
      checkedLines: tutorMessages.length,
      checkedFragments: tutorMessages.reduce((count, line) => count + countFragments(line).length, 0),
    },
  });
}

function evaluateRuntimeAssertion(
  ref: SyntheticLearnerAssertionReference,
  textCorpus: string[],
  runtimeEvents: SyntheticLearnerRuntimeEvent[],
  notebookEvents: SyntheticLearnerRuntimeEvent[],
  toolEvents: SyntheticLearnerToolEvent[],
  evidenceRefs: NodeRef[],
): SyntheticLearnerAssertion {
  let hasTutorTurns = false;
  let hasAgentRun = evidenceRefs.some((ref) => ref.refType === "session");
  let hasContextSelection = false;
  let hasEvaluateResponse = false;
  let hasArtifactLifecycle = false;
  let hasSessionLifecycle = false;
  let hasToolCalls = toolEvents.length > 0;

  for (const line of textCorpus) {
    if (line.startsWith("TUTOR: ") || line.startsWith("TUTOR COMPLETE: ")) {
      hasTutorTurns = true;
    }
    if (line.startsWith("RUN STARTED: ")) {
      hasAgentRun = true;
    }
  }

  for (const event of [...runtimeEvents, ...notebookEvents]) {
    if (event.eventType === "learning.evaluate_response" || event.eventType === "learning.mastery_evidence.recorded") {
      hasEvaluateResponse = true;
    }
    if (event.eventType.includes("artifact")) {
      hasArtifactLifecycle = true;
    }
    if (event.eventType.includes("session") || event.eventType.includes("digest") || event.eventType.includes("crystall")) {
      hasSessionLifecycle = true;
    }
    if (event.eventType === "session.context.selected" || event.eventType.includes("context")) {
      hasContextSelection = true;
    }
    if (event.eventType.startsWith("learner_trait.")) {
      hasToolCalls = true;
    }
  }

  if (toolEvents.some((event) => event.toolName.includes("artifact"))) {
    hasArtifactLifecycle = true;
  }

  if (!runtimeEvents.length && !notebookEvents.length && !toolEvents.length && !textCorpus.length) {
    return buildAssertion({
      ref,
      status: "skipped",
      passed: false,
      failureMessage: "No runtime trace data was provided.",
      evidenceRefs,
      details: { reason: "missing_runtime_trace" },
    });
  }

  const missing: string[] = [];
  const required = runtimeRequirementsFor(ref.refId);
  if (required.tutorTurns && !hasTutorTurns) missing.push("tutor turns");
  if (required.agentRun && !hasAgentRun) missing.push("agent run");
  if (required.toolCalls && !hasToolCalls) missing.push("tool calls");
  if (required.contextSelection && !hasContextSelection) missing.push("context selection");
  if (required.evaluateResponse && !hasEvaluateResponse) missing.push("mastery evaluation evidence");
  if (required.artifactLifecycle && !hasArtifactLifecycle) missing.push("artifact lifecycle");
  if (required.sessionLifecycle && !hasSessionLifecycle) missing.push("session lifecycle");

  if (missing.length) {
    return buildAssertion({
      ref,
      status: "failed",
      passed: false,
      failureMessage: `Missing runtime evidence for ${missing.join(", ")}.`,
      evidenceRefs,
      details: {
        missing,
        runtimeEventCount: runtimeEvents.length,
        notebookEventCount: notebookEvents.length,
        toolEventCount: toolEvents.length,
      },
    });
  }

  return buildAssertion({
    ref,
    status: "passed",
    passed: true,
    evidenceRefs,
    details: {
      runtimeEventCount: runtimeEvents.length,
      notebookEventCount: notebookEvents.length,
      toolEventCount: toolEvents.length,
    },
  });
}

function runtimeRequirementsFor(refId: string): {
  tutorTurns: boolean;
  agentRun: boolean;
  toolCalls: boolean;
  contextSelection: boolean;
  evaluateResponse: boolean;
  artifactLifecycle: boolean;
  sessionLifecycle: boolean;
} {
  const base = {
    tutorTurns: true,
    agentRun: true,
    toolCalls: true,
    contextSelection: true,
    evaluateResponse: false,
    artifactLifecycle: false,
    sessionLifecycle: false,
  };
  if (refId === "runtime_mastery_evidence") {
    return { ...base, toolCalls: false, evaluateResponse: true };
  }
  if (refId === "runtime_artifact_lifecycle") {
    return { ...base, artifactLifecycle: true };
  }
  if (refId === "runtime_session_digest") {
    return { ...base, toolCalls: false, sessionLifecycle: true };
  }
  if (refId === "runtime_trait_estimation") {
    return { ...base, tutorTurns: false, agentRun: false, contextSelection: false, toolCalls: true };
  }
  return base;
}

function evaluatePersistenceAssertion(
  ref: SyntheticLearnerAssertionReference,
  runtimeEvents: SyntheticLearnerRuntimeEvent[],
  persistence: SyntheticLearnerAssertionPersistenceEvidence | undefined,
  evidenceRefs: NodeRef[],
): SyntheticLearnerAssertion {
  const effectivePersistence = persistence ?? persistenceEvidenceFromRuntimeEvents(runtimeEvents);
  if (!effectivePersistence) {
    if (ref.required === false) {
      return buildAssertion({
        ref,
        status: "skipped",
        passed: false,
        failureMessage: "Optional persisted evidence snapshot was unavailable.",
        evidenceRefs,
        details: { reason: "skipped_optional_snapshot" },
      });
    }

    return buildAssertion({
      ref,
      status: "failed",
      passed: false,
      failureMessage: "Required persisted evidence snapshot was unavailable.",
      evidenceRefs,
      details: { reason: "unavailable_required_snapshot" },
    });
  }

  if (ref.refId === "persistence_conservative_movement") {
    const masteryEvidence = effectivePersistence.masteryEvidence ?? [];
    if (!masteryEvidence.length) {
      return buildAssertion({
        ref,
        status: runtimeEvents.some((event) => event.eventType === "learning.evaluate_response" || event.eventType === "learning.mastery_evidence.recorded") ? "failed" : "skipped",
        passed: false,
        failureMessage: "Mastery Evidence was not persisted for an evaluable answer.",
        evidenceRefs: [...evidenceRefs, ...masteryEvidence.map((entry) => entry.ref)],
        details: { reason: "missing_mastery_evidence" },
      });
    }

    const unstableEvidence = masteryEvidence.find(
      (entry) =>
        typeof entry.overallScore === "number" && typeof entry.confidence === "number" && entry.overallScore > 0.85 && entry.confidence < 0.6,
    );
    if (unstableEvidence) {
      return buildAssertion({
        ref,
        status: "failed",
        passed: false,
        failureMessage: "Mastery Evidence moved too aggressively for the observed learner response.",
        evidenceRefs: [...evidenceRefs, ...masteryEvidence.map((entry) => entry.ref)],
        details: {
          unstableEvidenceRef: unstableEvidence.ref,
          overallScore: unstableEvidence.overallScore,
          confidence: unstableEvidence.confidence,
        },
      });
    }

    return buildAssertion({
      ref,
      status: "passed",
      passed: true,
      evidenceRefs: [...evidenceRefs, ...masteryEvidence.map((entry) => entry.ref)],
      details: { masteryEvidenceCount: masteryEvidence.length },
    });
  }

  if (ref.refId === "persistence_artifact_status") {
    const artifacts = effectivePersistence.artifacts ?? [];
    if (!artifacts.length) {
      return buildAssertion({
        ref,
        status: "skipped",
        passed: false,
        failureMessage: "No persisted artifact records were provided.",
        evidenceRefs,
        details: { reason: "missing_artifact_snapshot" },
      });
    }

    const invalidArtifact = artifacts.find((artifact) => !ALLOWED_ARTIFACT_STATUSES.has(artifact.status));
    if (invalidArtifact) {
      return buildAssertion({
        ref,
        status: "failed",
        passed: false,
        failureMessage: `Artifact ${describeRef(invalidArtifact.ref)} has invalid lifecycle status ${invalidArtifact.status}.`,
        evidenceRefs: [...evidenceRefs, ...artifacts.map((artifact) => artifact.ref)],
        details: { invalidStatus: invalidArtifact.status },
      });
    }

    return buildAssertion({
      ref,
      status: "passed",
      passed: true,
      evidenceRefs: [...evidenceRefs, ...artifacts.map((artifact) => artifact.ref)],
      details: { artifactCount: artifacts.length },
    });
  }

  if (ref.refId === "persistence_crystallization_boundary") {
    const sessionEvents = effectivePersistence.sessionEvents ?? [];
    if (!sessionEvents.length) {
      return buildAssertion({
        ref,
        status: "skipped",
        passed: false,
        failureMessage: "No persisted session lifecycle events were provided.",
        evidenceRefs,
        details: { reason: "missing_session_snapshot" },
      });
    }

    const completionIndex = sessionEvents.findIndex((event) => event.eventType === "session.completed" || event.eventType === "session.ended");
    const crystallizationIndex = sessionEvents.findIndex(
      (event) => event.eventType === "session.crystallized" || event.eventType === "session.digest.created",
    );

    if (crystallizationIndex !== -1 && completionIndex !== -1 && crystallizationIndex < completionIndex) {
      return buildAssertion({
        ref,
        status: "failed",
        passed: false,
        failureMessage: "Session crystallized before the session boundary completed.",
        evidenceRefs: [...evidenceRefs, ...sessionEvents.flatMap((event) => (event.ref ? [event.ref] : []))],
        details: { crystallizationIndex, completionIndex },
      });
    }

    return buildAssertion({
      ref,
      status: "passed",
      passed: true,
      evidenceRefs: [...evidenceRefs, ...sessionEvents.flatMap((event) => (event.ref ? [event.ref] : []))],
      details: {
        sessionEventCount: sessionEvents.length,
        crystallizationSeen: crystallizationIndex !== -1,
        completionSeen: completionIndex !== -1,
      },
    });
  }

  if (ref.refId === "persistence_trait_estimates") {
    const sessionEvents = effectivePersistence.sessionEvents ?? [];
    const hasSignal = sessionEvents.some((event) => event.eventType === "learner_trait.signal.recorded");
    const hasDecision = sessionEvents.some((event) => event.eventType === "learner_trait.guardrail_decision.recorded");
    if (!hasSignal || !hasDecision) {
      return buildAssertion({
        ref,
        status: "failed",
        passed: false,
        failureMessage: "Trait estimation did not persist both signal and guardrail decision evidence.",
        evidenceRefs,
        details: { hasSignal, hasDecision },
      });
    }
    return buildAssertion({
      ref,
      status: "passed",
      passed: true,
      evidenceRefs: [...evidenceRefs, ...sessionEvents.flatMap((event) => (event.ref ? [event.ref] : []))],
      details: { hasSignal, hasDecision },
    });
  }

  if (ref.refId === "persistence_trait_recommendation_only" || ref.refId === "persistence_trait_no_mastery_mutation") {
    const sessionEvents = effectivePersistence.sessionEvents ?? [];
    const traitEvents = sessionEvents.filter((event) => event.eventType.startsWith("learner_trait."));
    const forbidden = traitEvents.filter((event) =>
      event.eventType.includes("mastery") ||
      event.eventType.includes("curriculum") ||
      event.eventType.includes("artifact"),
    );
    if (forbidden.length) {
      return buildAssertion({
        ref,
        status: "failed",
        passed: false,
        failureMessage: "Trait events crossed the recommendation-only boundary.",
        evidenceRefs,
        details: { forbiddenEventTypes: forbidden.map((event) => event.eventType) },
      });
    }
    return buildAssertion({
      ref,
      status: "passed",
      passed: true,
      evidenceRefs: [...evidenceRefs, ...traitEvents.flatMap((event) => (event.ref ? [event.ref] : []))],
      details: { traitEventCount: traitEvents.length },
    });
  }

  return buildAssertion({
    ref,
    status: "skipped",
    passed: false,
    failureMessage: `No persistence rule is implemented for assertion ${ref.refId}.`,
    evidenceRefs,
    details: { reason: "unsupported_persistence_assertion" },
  });
}

function persistenceEvidenceFromRuntimeEvents(
  runtimeEvents: SyntheticLearnerRuntimeEvent[],
): SyntheticLearnerAssertionPersistenceEvidence | undefined {
  const masteryEvidence = runtimeEvents.flatMap((event) => {
    if (event.eventType !== "mastery.evidence.recorded" && event.eventType !== "learning.mastery_evidence.recorded") return [];
    const evidence = isRecord(event.payload.evidence) ? event.payload.evidence : event.payload;
    const masteryEvidenceId = typeof event.payload.masteryEvidenceId === "string"
      ? event.payload.masteryEvidenceId
      : typeof evidence?.id === "string"
        ? evidence.id
        : undefined;
    if (!masteryEvidenceId) return [];
    const turnId = typeof evidence?.turnId === "string" ? evidence.turnId : undefined;
    const sessionId = typeof evidence?.sessionId === "string" ? evidence.sessionId : undefined;
    const entry: NonNullable<SyntheticLearnerAssertionPersistenceEvidence["masteryEvidence"]>[number] = {
      ref: turnId
        ? { refType: "turn" as const, refId: turnId }
        : sessionId
          ? { refType: "session" as const, refId: sessionId }
          : { refType: "turn" as const, refId: masteryEvidenceId },
    };
    if (typeof evidence?.correctnessLabel === "string") entry.correctnessLabel = evidence.correctnessLabel;
    if (typeof evidence?.overallScore === "number") entry.overallScore = evidence.overallScore;
    if (typeof evidence?.confidence === "number") entry.confidence = evidence.confidence;
    if (typeof evidence?.triggerSource === "string") entry.triggerSource = evidence.triggerSource;
    return [entry];
  });

  const sessionEvents = runtimeEvents
    .filter((event) => event.eventType.startsWith("session.") || event.eventType.startsWith("learner_trait."))
    .map((event) => {
      const sessionRef = sessionRefFromPayload(event.payload);
      return {
        ...(sessionRef ? { ref: sessionRef } : {}),
        eventType: event.eventType,
        timestamp: event.timestamp,
      };
    });

  const artifacts = runtimeEvents.flatMap((event) => {
    if (!event.eventType.startsWith("artifact.")) return [];
    const artifactId = typeof event.payload.artifactId === "string" ? event.payload.artifactId : undefined;
    if (!artifactId) return [];
    const status = typeof event.payload.status === "string" ? event.payload.status : event.eventType.split(".").at(-1) ?? "unknown";
    return [{ ref: { refType: "artifact" as const, refId: artifactId }, status }];
  });

  if (!masteryEvidence.length && !sessionEvents.length && !artifacts.length) return undefined;
  return { masteryEvidence, sessionEvents, artifacts };
}

function sessionRefFromPayload(payload: Record<string, unknown>): NodeRef | undefined {
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : undefined;
  return sessionId ? { refType: "session", refId: sessionId } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function inferAssertionCategory(refId: string): "learner_visible" | "runtime" | "persistence" | "report" {
  if (refId.startsWith("learner_visible")) return "learner_visible";
  if (refId.startsWith("runtime")) return "runtime";
  if (refId.startsWith("persistence")) return "persistence";
  return "report";
}

function collectEvidenceRefs(input: SyntheticLearnerAssertionEngineInput): NodeRef[] {
  const refs = [
    ...(input.traceRefs ?? []),
    ...(input.notebookRefs ?? []),
    ...(input.toolEvents ?? []).flatMap((event) => event.nodeRefs ?? []),
    ...(input.persistence?.masteryEvidence ?? []).map((entry) => entry.ref),
    ...(input.persistence?.artifacts ?? []).map((entry) => entry.ref),
    ...(input.persistence?.sessionEvents ?? []).flatMap((event) => (event.ref ? [event.ref] : [])),
  ];
  return dedupeNodeRefs(refs);
}

function collectFlaggedFragments(lines: string[]): string[] {
  const flagged: string[] = [];
  for (const line of lines) {
    for (const fragment of countFragments(line)) {
      flagged.push(fragment);
    }
    for (const prefix of DEBUG_NARRATION_PREFIXES) {
      if (line.includes(prefix)) {
        flagged.push(prefix);
      }
    }
    if (line.includes("[object Object]")) {
      flagged.push("[object Object]");
    }
  }
  return [...new Set(flagged)];
}

function countFragments(line: string): string[] {
  const matches: string[] = [];
  for (const pattern of RAW_ID_MATCHERS) {
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      matches.push(match[0] ?? "");
    }
  }
  return matches;
}

function buildAssertion(input: {
  ref: SyntheticLearnerAssertionReference;
  status: SyntheticLearnerAssertionStatus;
  passed: boolean;
  failureMessage?: string;
  evidenceRefs: NodeRef[];
  details?: Record<string, unknown>;
}): SyntheticLearnerAssertion {
  return {
    id: input.ref.refId,
    category: inferAssertionCategory(input.ref.refId),
    description: input.ref.label ?? input.ref.refId.replaceAll("_", " "),
    status: input.status,
    passed: input.passed,
    ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
    evidenceRefs: dedupeNodeRefs(input.evidenceRefs),
    details: input.details ?? {},
  };
}

function dedupeNodeRefs(refs: NodeRef[]): NodeRef[] {
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

function describeRef(ref: NodeRef): string {
  return `${ref.refType}:${ref.refId}`;
}
