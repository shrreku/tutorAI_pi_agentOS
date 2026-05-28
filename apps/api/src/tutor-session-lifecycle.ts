import { and, desc, eq } from "drizzle-orm";
import { appendEvent, tutorSessions, tutorTurns, type DbClient } from "@studyagent/db";
import {
  createRuntimeRun,
  disposeStudyAgentTutorSession,
  replaceStudyAgentTutorRuntime,
  type StudyAgentPromptContext,
} from "@studyagent/agent-runtime";
import { nodeRefSchema, type NodeRef } from "@studyagent/schemas";
import { crystallizeTutorSession } from "./phase7.js";
import { runLearnerTraitEstimationCycle, type LearnerTraitEstimatorClient } from "./learner-trait-estimation.js";

export type TutorSessionCompletionResult =
  | { status: "completed"; artifactId: string; reason: "crystallized" }
  | { status: "completed"; artifactId: null; reason: "ended_without_turns" };

export async function pauseTutorSessionLifecycle(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId?: string;
    sessionId: string;
    disposeRuntime?: (sessionId: string) => Promise<void>;
  },
): Promise<{ sessionId: string; status: "paused" }> {
  await dbClient.db
    .update(tutorSessions)
    .set({ status: "paused" })
    .where(eq(tutorSessions.id, input.sessionId));

  await (input.disposeRuntime ?? disposeStudyAgentTutorSession)(input.sessionId);

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    eventType: "session.focus.updated",
    payload: { action: "paused", sessionId: input.sessionId },
  });

  return { sessionId: input.sessionId, status: "paused" };
}

export async function pauseTutorSessionLifecycleForRequest(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    requestedSessionId?: string;
  },
): Promise<{ sessionId: string; status: "paused" } | null> {
  const session = await resolveTutorSessionLifecycle(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    ...(input.requestedSessionId ? { requestedSessionId: input.requestedSessionId } : {}),
    allowedStatuses: ["active"],
  });
  if (!session) return null;
  return pauseTutorSessionLifecycle(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: session.id,
  });
}

export async function resumeTutorSessionLifecycle(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    sessionId: string;
    mode: StudyAgentPromptContext["activeMode"];
    selectedNodeRefs: NodeRef[];
    model: string;
    replaceRuntime?: typeof replaceStudyAgentTutorRuntime;
  },
): Promise<{ sessionId: string; status: "active" }> {
  await dbClient.db
    .update(tutorSessions)
    .set({ status: "active" })
    .where(eq(tutorSessions.id, input.sessionId));

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    eventType: "session.focus.updated",
    payload: { action: "resumed", sessionId: input.sessionId },
  });

  try {
    const resumeRun = createRuntimeRun({
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      userId: input.userId,
      selectedNodeRefs: input.selectedNodeRefs,
      activeMode: input.mode,
      modelConfig: { model: input.model },
    });
    await (input.replaceRuntime ?? replaceStudyAgentTutorRuntime)({ previousSessionId: input.sessionId, nextRun: resumeRun });
  } catch (error) {
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      eventType: "session.runtime.replacement_failed",
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  return { sessionId: input.sessionId, status: "active" };
}

export async function resumeTutorSessionLifecycleForRequest(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    requestedSessionId?: string;
    model: string;
  },
): Promise<{ sessionId: string; status: "active" } | null> {
  const session = await resolveTutorSessionLifecycle(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    ...(input.requestedSessionId ? { requestedSessionId: input.requestedSessionId } : {}),
    allowedStatuses: ["paused", "active"],
  });
  if (!session) return null;
  return resumeTutorSessionLifecycle(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: session.id,
    selectedNodeRefs: parseNodeRefs(session.selectedNodeRefsJson),
    mode: normalizeSessionMode(session.mode),
    model: input.model,
  });
}

export async function completeTutorSessionLifecycle(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    sessionId: string;
    runtimeContextJson: unknown;
    estimator?: LearnerTraitEstimatorClient;
    disposeRuntime?: (sessionId: string) => Promise<void>;
  },
): Promise<TutorSessionCompletionResult> {
  const [lastTurn] = await dbClient.db
    .select()
    .from(tutorTurns)
    .where(eq(tutorTurns.sessionId, input.sessionId))
    .orderBy(desc(tutorTurns.turnIndex))
    .limit(1);

  if (!lastTurn || !lastTurn.userMessage || !lastTurn.assistantMessage) {
    await dbClient.db
      .update(tutorSessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(tutorSessions.id, input.sessionId));
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      sessionId: input.sessionId,
      eventType: "session.completed",
      payload: { sessionId: input.sessionId, reason: "ended_without_turns" },
    });
    await (input.disposeRuntime ?? disposeStudyAgentTutorSession)(input.sessionId);
    return { status: "completed", artifactId: null, reason: "ended_without_turns" };
  }

  const runtimeCtx = isJsonRecord(input.runtimeContextJson) ? input.runtimeContextJson : {};
  const sourceIds = stringArray(runtimeCtx.sourceIds);
  const citationIds = stringArray(runtimeCtx.citationIds);
  const artifactProposalIds = stringArray(runtimeCtx.artifactProposalIds);
  const currentObjective = typeof runtimeCtx.currentObjective === "string" ? runtimeCtx.currentObjective : undefined;

  const digest = await crystallizeTutorSession(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: input.sessionId,
    assistantMessage: lastTurn.assistantMessage,
    userMessage: lastTurn.userMessage,
    sourceIds,
    citationIds,
    artifactProposalIds,
    ...(currentObjective ? { currentObjective } : {}),
  });

  if (input.estimator) {
    await runLearnerTraitEstimationCycle({
      dbClient,
      notebookId: input.notebookId,
      userId: input.userId,
      sessionId: input.sessionId,
      estimator: input.estimator,
    });
  }

  await (input.disposeRuntime ?? disposeStudyAgentTutorSession)(input.sessionId);

  return { status: "completed", artifactId: digest.artifactId, reason: "crystallized" };
}

export async function completeTutorSessionLifecycleForRequest(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    requestedSessionId?: string;
    estimator?: LearnerTraitEstimatorClient;
  },
): Promise<(TutorSessionCompletionResult & { sessionId: string }) | null> {
  const session = await resolveTutorSessionLifecycle(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    ...(input.requestedSessionId ? { requestedSessionId: input.requestedSessionId } : {}),
    allowedStatuses: ["active", "paused"],
  });
  if (!session) return null;
  const result = await completeTutorSessionLifecycle(dbClient, {
    notebookId: input.notebookId,
    userId: input.userId,
    sessionId: session.id,
    runtimeContextJson: session.runtimeContextJson,
    ...(input.estimator ? { estimator: input.estimator } : {}),
  });
  return { ...result, sessionId: session.id };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveTutorSessionLifecycle(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    requestedSessionId?: string;
    allowedStatuses: string[];
  },
) {
  if (input.requestedSessionId) {
    const [requested] = await dbClient.db
      .select()
      .from(tutorSessions)
      .where(and(eq(tutorSessions.id, input.requestedSessionId), eq(tutorSessions.notebookId, input.notebookId), eq(tutorSessions.userId, input.userId)))
      .limit(1);
    if (!requested) return null;
    return input.allowedStatuses.includes(requested.status) ? requested : null;
  }

  const rows = await dbClient.db
    .select()
    .from(tutorSessions)
    .where(and(eq(tutorSessions.notebookId, input.notebookId), eq(tutorSessions.userId, input.userId)))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(5);
  return rows.find((row) => input.allowedStatuses.includes(row.status)) ?? null;
}

function parseNodeRefs(value: unknown): NodeRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => nodeRefSchema.safeParse(entry))
    .filter((result): result is { success: true; data: NodeRef } => result.success)
    .map((result) => result.data);
}

function normalizeSessionMode(value: string): StudyAgentPromptContext["activeMode"] {
  if (value === "learn" || value === "practice" || value === "revise" || value === "explore" || value === "wiki_maintenance") {
    return value;
  }
  return "learn";
}
