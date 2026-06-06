import { and, desc, eq, sql } from "drizzle-orm";
import { artifacts, tutorSessions, type DbClient } from "@studyagent/db";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";

type RuntimeMeta = {
  notebookId: string;
  userId: string;
  runId?: string;
  sessionId?: string;
};

type DigestRuntimeMeta = {
  notebookId: string;
  sessionId: string;
  runId?: string;
};

export type TutorSessionDigestContext = {
  sessionId: string;
  assistantMessage: string;
  userMessage: string;
  currentObjective?: string;
  sourceIds: string[];
  citationIds: string[];
  artifactProposalIds: string[];
  studyPlanSummary?: string;
  learnerStateSummary?: string;
  learnerProgressSummary?: string;
  turnId?: string;
  status: "draft" | "ready";
};

export function buildTutorSessionDigestPayload(input: TutorSessionDigestContext): Record<string, unknown> {
  const nextStep = input.currentObjective ? `Continue with ${input.currentObjective}` : "Continue the current tutoring path";

  return {
    sessionId: input.sessionId,
    status: input.status,
    summary: input.assistantMessage,
    learnerMessage: input.userMessage,
    currentObjective: input.currentObjective ?? null,
    studyPlanSummary: input.studyPlanSummary ?? null,
    learnerStateSummary: input.learnerStateSummary ?? null,
    learnerProgressSummary: input.learnerProgressSummary ?? null,
    nextStep,
    provenance: {
      sourceIds: input.sourceIds,
      citationIds: input.citationIds,
      artifactProposalIds: input.artifactProposalIds,
      turnId: input.turnId ?? null,
    },
  };
}

export async function upsertTutorSessionDigestArtifact(
  dbClient: DbClient,
  input: DigestRuntimeMeta & TutorSessionDigestContext,
): Promise<{ artifactId: string; created: boolean }> {
  const [existingMatchesSession] = await dbClient.db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.notebookId, input.notebookId),
        eq(artifacts.artifactType, "session_digest"),
        sql`${artifacts.payloadJson}->>'sessionId' = ${input.sessionId}`,
      ),
    )
    .orderBy(desc(artifacts.updatedAt))
    .limit(1);
  const payloadJson = buildTutorSessionDigestPayload(input);
  const now = new Date();

  if (existingMatchesSession) {
    await dbClient.db
      .update(artifacts)
      .set({
        title:
          input.status === "ready"
            ? `Session digest · ${now.toLocaleDateString("en-US")}`
            : `Session digest draft · ${now.toLocaleDateString("en-US")}`,
        status: input.status,
        payloadJson,
        sourceNodeRefsJson: input.sourceIds.map((sourceId) => ({ refType: "source", refId: sourceId })),
        sourceClaimIds: input.citationIds,
        sourceChunkIds: [],
        createdByRunId: input.runId,
        updatedAt: now,
      })
      .where(eq(artifacts.id, existingMatchesSession.id));

    return { artifactId: existingMatchesSession.id, created: false };
  }

  const artifactId = `artifact_${crypto.randomUUID().replaceAll("-", "")}`;
  await dbClient.db.insert(artifacts).values({
    id: artifactId,
    notebookId: input.notebookId,
    artifactType: "session_digest",
    title:
      input.status === "ready"
        ? `Session digest · ${now.toLocaleDateString("en-US")}`
        : `Session digest draft · ${now.toLocaleDateString("en-US")}`,
    status: input.status,
    payloadJson,
    sourceNodeRefsJson: input.sourceIds.map((sourceId) => ({ refType: "source", refId: sourceId })),
    sourceClaimIds: input.citationIds,
    sourceChunkIds: [],
    createdByRunId: input.runId,
  });

  return { artifactId, created: true };
}

export async function crystallizeTutorSession(
  dbClient: DbClient,
  input: RuntimeMeta & {
    sessionId: string;
    assistantMessage: string;
    userMessage: string;
    currentObjective?: string;
    sourceIds: string[];
    citationIds: string[];
    artifactProposalIds: string[];
    studyPlanSummary?: string;
    learnerStateSummary?: string;
    learnerProgressSummary?: string;
  },
): Promise<{ artifactId: string | null }> {
  const now = new Date();
  const [existingSession] = await dbClient.db
    .select({ runtimeContextJson: tutorSessions.runtimeContextJson })
    .from(tutorSessions)
    .where(eq(tutorSessions.id, input.sessionId))
    .limit(1);

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.crystallization.started",
    payload: {
      currentObjective: input.currentObjective,
      sourceIds: input.sourceIds,
      citationIds: input.citationIds,
    },
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.crystallization.completed",
    payload: {
      sessionId: input.sessionId,
    },
  });

  await dbClient.db
    .update(tutorSessions)
    .set({
      status: "completed",
      endedAt: now,
      runtimeContextJson: {
        ...(isJsonRecord(existingSession?.runtimeContextJson) ? existingSession.runtimeContextJson : {}),
        status: "completed",
        endedAt: now.toISOString(),
        sessionDigestDraft: null,
        updatedAt: now.toISOString(),
        crystallizedArtifactId: null,
      },
    })
    .where(eq(tutorSessions.id, input.sessionId));

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    eventType: "session.completed",
    payload: {
      sessionId: input.sessionId,
    },
  });

  return { artifactId: null };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
