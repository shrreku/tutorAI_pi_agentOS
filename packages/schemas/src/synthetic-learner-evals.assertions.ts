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

  for (const line of textCorpus) {
    if (line.startsWith("TUTOR: ") || line.startsWith("TUTOR COMPLETE: ")) {
      hasTutorTurns = true;
    }
    if (line.startsWith("RUN STARTED: ")) {
      hasAgentRun = true;
    }
  }

  for (const event of [...runtimeEvents, ...notebookEvents]) {
    if (event.eventType === "learning.evaluate_response") {
      hasEvaluateResponse = true;
    }
    if (event.eventType === "session.context.selected" || event.eventType.includes("context")) {
      hasContextSelection = true;
    }
  }

  const hasToolCalls = toolEvents.length > 0;

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
  if (!hasTutorTurns) missing.push("tutor turns");
  if (!hasAgentRun) missing.push("agent run");
  if (!hasToolCalls) missing.push("tool calls");
  if (!hasContextSelection) missing.push("context selection");
  if (!hasEvaluateResponse) missing.push("learning.evaluate_response");

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

function evaluatePersistenceAssertion(
  ref: SyntheticLearnerAssertionReference,
  runtimeEvents: SyntheticLearnerRuntimeEvent[],
  persistence: SyntheticLearnerAssertionPersistenceEvidence | undefined,
  evidenceRefs: NodeRef[],
): SyntheticLearnerAssertion {
  if (!persistence) {
    return buildAssertion({
      ref,
      status: "skipped",
      passed: false,
      failureMessage: "No persisted evidence snapshot was provided.",
      evidenceRefs,
      details: { reason: "missing_persistence_snapshot" },
    });
  }

  if (ref.refId === "persistence_conservative_movement") {
    const masteryEvidence = persistence.masteryEvidence ?? [];
    if (!masteryEvidence.length) {
      return buildAssertion({
        ref,
        status: runtimeEvents.some((event) => event.eventType === "learning.evaluate_response") ? "failed" : "skipped",
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
    const artifacts = persistence.artifacts ?? [];
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
    const sessionEvents = persistence.sessionEvents ?? [];
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

  return buildAssertion({
    ref,
    status: "skipped",
    passed: false,
    failureMessage: `No persistence rule is implemented for assertion ${ref.refId}.`,
    evidenceRefs,
    details: { reason: "unsupported_persistence_assertion" },
  });
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
