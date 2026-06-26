import {
  eventTypeSchema,
  type EventType,
  type WorkspaceRefreshHint,
  type WorkspaceRefreshTarget,
} from "./events.js";

export type WorkspaceRefreshPolicy = {
  label: string;
  targets: WorkspaceRefreshTarget[];
  nodeIds: string[];
  artifactIds: string[];
  sourceIds: string[];
};

const SOURCE_EVENTS = new Set<string>([
  "source.uploaded",
  "source.tutoring_ready",
  "source.readiness.updated",
  "source.ingestion.ready",
  "source.ingestion.failed",
  "ingestion.job.completed",
  "ingestion.job.failed",
]);

const GENERATION_EVENTS = new Set<string>([
  "generation.initial_build.started",
  "generation.initial_build.completed",
  "generation.initial_build.failed",
  "generation.curriculum_outline.generated",
  "generation.touch.background_enqueued",
  "generation.module_deep_build.started",
  "generation.module_deep_build.completed",
  "generation.page.heuristic.created",
  "generation.page.polish.started",
  "generation.page.polish.completed",
  "generation.page.polish.failed",
  "generation.page.readiness_changed",
  "generation.touch.started",
  "generation.touch.foreground_timeout",
  "generation.touch.completed",
  "generation.touch.failed",
  "module.rolling_build.completed",
]);

const GRAPH_EVENTS = new Set<string>([
  "graph.projection.updated",
  "graph.neo4j_projection.updated",
  "graph.neo4j_projection.failed",
  "source.tutoring_ready",
  "source.readiness.updated",
  "wiki.page.updated",
  "wiki.page.readiness_changed",
  "reference.regenerated",
  ...GENERATION_EVENTS,
]);

const CURRICULUM_EVENTS = new Set<string>([
  "curriculum.activated",
  "curriculum.updated",
  "module.updated",
  "module.generated",
  "module.rolling_build.completed",
  "objective.updated",
  "objective_list.updated",
  "objective_list.reordered",
  "objective_list.objective_split",
  "objective_list.objectives_merged",
  "study_plan.updated",
  "objective.completed",
  "generation.initial_build.completed",
  "generation.module_deep_build.completed",
]);

const STUDY_STATE_EVENTS = new Set<string>([
  ...CURRICULUM_EVENTS,
  "session_plan.generated",
  "session_plan.updated",
  "coverage.record.updated",
  "session.started",
  "session.focus.updated",
  "session.completed",
  "session.crystallization.started",
  "session.crystallization.completed",
  "session.digest.draft.updated",
  "learning.mastery_evidence.recorded",
  "learning.mastery.updated",
  "learning.weak_concept.added",
  "learning.review.scheduled",
  "quiz.attempt.recorded",
]);

export function workspaceRefreshPolicyForEvent(
  eventType: string,
  serverHint?: WorkspaceRefreshHint | null,
): WorkspaceRefreshPolicy {
  const targets = new Set<WorkspaceRefreshTarget>(serverHint?.targets ?? []);
  const nodeIds = new Set(serverHint?.nodeIds ?? []);
  const artifactIds = new Set(serverHint?.artifactIds ?? []);
  const sourceIds = new Set(serverHint?.sourceIds ?? []);

  if (SOURCE_EVENTS.has(eventType)) {
    targets.add("sources");
    targets.add("sourceFiles");
  }
  if (GRAPH_EVENTS.has(eventType)) targets.add("graph");
  if (CURRICULUM_EVENTS.has(eventType)) targets.add("curriculum");
  if (STUDY_STATE_EVENTS.has(eventType)) {
    targets.add("graph");
    targets.add("studyState");
    if (eventType === "session.focus.updated") {
      targets.add("referenceSurfaces");
    }
  }
  if (eventType.startsWith("artifact.")) {
    targets.add("artifacts");
    targets.add("referenceSurfaces");
    targets.add("graph");
    targets.add("studyState");
  }
  if (eventType === "quiz.attempt.recorded") {
    targets.add("quizAttempts");
    targets.add("artifacts");
    targets.add("graph");
    targets.add("studyState");
  }
  if (
    eventType === "reference.regenerated" ||
    eventType === "wiki.page.updated" ||
    eventType === "wiki.page.ensured" ||
    eventType === "wiki.page.readiness_changed" ||
    GENERATION_EVENTS.has(eventType)
  ) {
    targets.add("referenceSurfaces");
    targets.add("graph");
    targets.add("curriculum");
  }

  if (targets.size === 0 && eventTypeSchema.safeParse(eventType).success) {
    for (const target of defaultRefreshTargetsForKnownEvent(eventType)) {
      targets.add(target);
    }
  }

  return {
    label: eventType.replaceAll(".", " ").replaceAll("_", " "),
    targets: [...targets],
    nodeIds: [...nodeIds],
    artifactIds: [...artifactIds],
    sourceIds: [...sourceIds],
  };
}

function defaultRefreshTargetsForKnownEvent(eventType: string): WorkspaceRefreshTarget[] {
  if (eventType.startsWith("source.")) return ["sources", "sourceFiles"];
  if (
    eventType.startsWith("wiki.") ||
    eventType.startsWith("ingestion.") ||
    eventType.startsWith("generation.")
  ) {
    return ["graph", "referenceSurfaces", "curriculum"];
  }
  if (eventType.startsWith("agent.") || eventType.startsWith("tutor.")) return ["studyState"];
  if (eventType.startsWith("session.") || eventType.startsWith("learning."))
    return ["studyState", "graph"];
  if (eventType.startsWith("graph.") || eventType.startsWith("whiteboard.")) return ["graph"];
  if (
    eventType.startsWith("curriculum.") ||
    eventType.startsWith("module.") ||
    eventType.startsWith("objective") ||
    eventType.startsWith("session_plan.") ||
    eventType.startsWith("study_plan.") ||
    eventType.startsWith("teaching_arc.") ||
    eventType.startsWith("coverage.")
  ) {
    return ["curriculum", "studyState", "graph"];
  }
  if (eventType.startsWith("student_profile.") || eventType.startsWith("notebook."))
    return ["studyState"];
  if (eventType.startsWith("artifact.") || eventType === "reference.regenerated") {
    return ["artifacts", "referenceSurfaces", "graph", "studyState"];
  }
  return ["studyState"];
}

export function resolveWorkspaceRefreshPolicy(
  eventType: string,
  serverHint?: WorkspaceRefreshHint | null,
): WorkspaceRefreshPolicy {
  const base = workspaceRefreshPolicyForEvent(eventType, serverHint);
  if (!serverHint?.targets?.length) return base;

  const targets = new Set<WorkspaceRefreshTarget>([...base.targets, ...serverHint.targets]);
  const nodeIds = new Set([...base.nodeIds, ...(serverHint.nodeIds ?? [])]);
  const artifactIds = new Set([...base.artifactIds, ...(serverHint.artifactIds ?? [])]);
  const sourceIds = new Set([...base.sourceIds, ...(serverHint.sourceIds ?? [])]);

  return {
    label: base.label,
    targets: [...targets],
    nodeIds: [...nodeIds],
    artifactIds: [...artifactIds],
    sourceIds: [...sourceIds],
  };
}

export function workspaceRefreshHintForEvent(
  eventType: EventType | string,
  payload: Record<string, unknown> = {},
): WorkspaceRefreshHint {
  const artifactId = stringValue(payload.artifactId);
  const sourceId = stringValue(payload.sourceId);
  const nodeId =
    stringValue(payload.surfaceNodeId) ??
    stringValue(payload.nodeId) ??
    stringValue(payload.id) ??
    stringValue(payload.pageId);
  const policy = workspaceRefreshPolicyForEvent(eventType, {
    targets: [],
    nodeIds: nodeId ? [nodeId] : [],
    artifactIds: artifactId ? [artifactId] : [],
    sourceIds: sourceId ? [sourceId] : [],
  });
  return {
    targets: policy.targets,
    nodeIds: policy.nodeIds,
    artifactIds: policy.artifactIds,
    sourceIds: policy.sourceIds,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
