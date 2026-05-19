import type { TutorContextSelection } from "./tutor-tool-provider.js";

export type DigestDraftShape = {
  summary: string | null;
  currentObjective: string | null;
  studyPlanSummary: string | null;
  learnerStateSummary: string | null;
  citationIds: string[];
  sourceIds: string[];
  artifactProposalIds: string[];
};

export function shouldEmitDigestDraftUpdate(previous: DigestDraftShape | null, next: DigestDraftShape): boolean {
  if (!previous) return true;
  const previousCitationIds = [...new Set(previous.citationIds)].sort();
  const nextCitationIds = [...new Set(next.citationIds)].sort();
  const previousSourceIds = [...new Set(previous.sourceIds)].sort();
  const nextSourceIds = [...new Set(next.sourceIds)].sort();
  const previousArtifactProposalIds = [...new Set(previous.artifactProposalIds)].sort();
  const nextArtifactProposalIds = [...new Set(next.artifactProposalIds)].sort();
  return (
    previous.summary !== next.summary ||
    previous.currentObjective !== next.currentObjective ||
    previous.studyPlanSummary !== next.studyPlanSummary ||
    previous.learnerStateSummary !== next.learnerStateSummary ||
    JSON.stringify(previousCitationIds) !== JSON.stringify(nextCitationIds) ||
    JSON.stringify(previousSourceIds) !== JSON.stringify(nextSourceIds) ||
    JSON.stringify(previousArtifactProposalIds) !== JSON.stringify(nextArtifactProposalIds)
  );
}

export function shouldCompactTutorContext(input: {
  turnIndex: number;
  previousRuntimeContext: Record<string, unknown>;
  message: string;
  assistantMessage: string;
  currentObjective: string | null;
  studyPlanSummary: string | null;
  learnerStateSummary: string | null;
  selectedNodeRefs: Array<{ refType: string; refId: string }>;
  sourceIds: string[];
  citationIds: string[];
  artifactProposalIds: string[];
  activeSessionPlanId: string | null;
  openArtifact: { id: string; artifactType: string; title: string; status: string } | null;
  contextSelection: TutorContextSelection | null;
  toolSummary: Array<{ toolCallId: string; toolName: string; status: string; latencyMs?: number }>;
}): { shouldCompact: boolean; reasons: string[]; estimatedChars: number } {
  const reasons: string[] = [];
  const lastCompaction = isJsonRecord(input.previousRuntimeContext.lastCompaction)
    ? input.previousRuntimeContext.lastCompaction
    : null;
  const previousTurnIndex = typeof lastCompaction?.turnIndex === "number" ? lastCompaction.turnIndex : null;
  const previousEstimatedChars = typeof lastCompaction?.estimatedChars === "number" ? lastCompaction.estimatedChars : 0;
  const estimatedChars = estimateTutorContextChars(input);

  if (previousTurnIndex !== null && input.turnIndex - previousTurnIndex >= COMPACTION_TURN_INTERVAL) {
    reasons.push("turn_interval");
  }
  if (estimatedChars >= COMPACTION_CONTEXT_CHAR_THRESHOLD) {
    reasons.push("context_size");
  } else if (previousEstimatedChars > 0 && estimatedChars - previousEstimatedChars >= COMPACTION_CONTEXT_GROWTH_THRESHOLD) {
    reasons.push("context_growth");
  }
  if (
    previousTurnIndex !== null &&
    input.turnIndex > 0 &&
    stringOrNull(input.previousRuntimeContext.currentObjective) !== input.currentObjective
  ) {
    reasons.push("objective_changed");
  }
  if (
    previousTurnIndex !== null &&
    input.turnIndex > 0 &&
    stringOrNull(input.previousRuntimeContext.activeSessionPlanId) !== input.activeSessionPlanId
  ) {
    reasons.push("session_plan_changed");
  }
  if (
    previousTurnIndex !== null &&
    input.turnIndex > 0 &&
    openArtifactFingerprint(input.previousRuntimeContext.openArtifact) !== openArtifactFingerprint(input.openArtifact)
  ) {
    reasons.push("open_artifact_changed");
  }
  if (previousTurnIndex !== null && input.turnIndex - previousTurnIndex >= 2 && isLearnerConfirmation(input.message)) {
    reasons.push("learner_progression");
  }
  if (
    previousTurnIndex !== null &&
    input.turnIndex - previousTurnIndex >= 2 &&
    input.toolSummary.some((tool) => isDurableTutorTool(tool.toolName))
  ) {
    reasons.push("durable_tool_change");
  }
  if (previousTurnIndex !== null && input.turnIndex > 0 && hasNewRuntimeItems(input.previousRuntimeContext.sourceIds, input.sourceIds)) {
    reasons.push("source_context_changed");
  }
  if (
    previousTurnIndex !== null &&
    input.turnIndex > 0 &&
    hasNewRuntimeItems(input.previousRuntimeContext.artifactProposalIds, input.artifactProposalIds)
  ) {
    reasons.push("artifact_context_changed");
  }
  if (
    previousTurnIndex !== null &&
    input.turnIndex > 0 &&
    input.citationIds.length >= 3 &&
    hasNewRuntimeItems(input.previousRuntimeContext.citationIds, input.citationIds)
  ) {
    reasons.push("citation_context_changed");
  }

  return {
    shouldCompact: reasons.length > 0,
    reasons: [...new Set(reasons)],
    estimatedChars,
  };
}

const COMPACTION_TURN_INTERVAL = 4;
const COMPACTION_CONTEXT_CHAR_THRESHOLD = 8000;
const COMPACTION_CONTEXT_GROWTH_THRESHOLD = 3000;

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLearnerConfirmation(message: string): boolean {
  return /\b(understood|got it|i got this|clear|yes|continue|next|easy|done|makes sense)\b/i.test(message);
}

function estimateTutorContextChars(input: {
  message: string;
  assistantMessage: string;
  currentObjective: string | null;
  studyPlanSummary: string | null;
  learnerStateSummary: string | null;
  selectedNodeRefs: Array<{ refType: string; refId: string }>;
  sourceIds: string[];
  citationIds: string[];
  artifactProposalIds: string[];
  activeSessionPlanId: string | null;
  openArtifact: { id: string; artifactType: string; title: string; status: string } | null;
  contextSelection: TutorContextSelection | null;
}): number {
  const chunks = [
    input.message,
    input.assistantMessage,
    input.currentObjective,
    input.studyPlanSummary,
    input.learnerStateSummary,
    JSON.stringify(input.selectedNodeRefs),
    JSON.stringify(input.sourceIds),
    JSON.stringify(input.citationIds),
    JSON.stringify(input.artifactProposalIds),
    input.activeSessionPlanId,
    input.openArtifact ? JSON.stringify(input.openArtifact) : null,
    input.contextSelection
      ? JSON.stringify({
          strategy: input.contextSelection.strategy,
          query: input.contextSelection.query,
          selectedChunkIds: input.contextSelection.selectedChunkIds,
          selectedSourceIds: input.contextSelection.selectedSourceIds,
          recentMistakeConceptIds: input.contextSelection.recentMistakeConceptIds,
        })
      : null,
  ];
  return chunks.reduce((total, value) => total + (typeof value === "string" ? value.length : 0), 0);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function hasNewRuntimeItems(previous: unknown, next: string[]): boolean {
  const previousSet = new Set(Array.isArray(previous) ? previous.filter((value): value is string => typeof value === "string") : []);
  return next.some((value) => !previousSet.has(value));
}

function openArtifactFingerprint(value: unknown): string | null {
  if (!isJsonRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const status = typeof value.status === "string" ? value.status : "";
  const artifactType = typeof value.artifactType === "string" ? value.artifactType : "";
  return id ? `${id}:${artifactType}:${status}` : null;
}

function isDurableTutorTool(toolName: string): boolean {
  return (
    toolName.startsWith("artifact.") ||
    toolName.startsWith("coverage.") ||
    toolName.startsWith("session_plan.") ||
    toolName.startsWith("student_profile.") ||
    toolName.startsWith("objective.") ||
    toolName.startsWith("module.") ||
    toolName === "curriculum.activate"
  );
}
