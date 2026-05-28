import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  agentRuns,
  artifacts,
  claims,
  events,
  masteryEvidence,
  notebooks,
  sources,
  toolCalls,
  tutorSessions,
  tutorTurns,
  wikiPages,
} from "@studyagent/db";
import {
  chatTraceResponseSchema,
  developerTimelineResponseSchema,
  type ChatTraceResponse,
  type ChatTraceRun,
  type ChatTraceStateChange,
  type ChatTraceToolCall,
  type DeveloperTimelineItem,
  type DeveloperTimelineResponse,
  type TraceUsage,
  parseMasteryEvidence,
} from "@studyagent/schemas";
import { formatTraceUsage, normalizeTraceUsage } from "@studyagent/observability";
import type { AppContext } from "../context.js";
import { resolveActor } from "../auth.js";

type EventLookup = Map<string, TraceUsage | undefined>;
type TimelineNodeRef = DeveloperTimelineItem["nodeRefs"][number];

export async function registerDeveloperTimelineRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: { notebookId: string }; Querystring: { limit?: string } }>(
    "/notebooks/:notebookId/developer/timeline",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;
      const limit = clampLimit(request.query.limit ?? "120");

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      const [runRows, toolRows, eventRows, wikiRows, artifactRows, claimRows, sourceRows, turnRows, masteryEvidenceRows] =
        await Promise.all([
        ctx.db.db
          .select({
            id: agentRuns.id,
            notebookId: tutorSessions.notebookId,
            sessionId: agentRuns.sessionId,
            turnId: agentRuns.turnId,
            runType: agentRuns.runType,
            status: agentRuns.status,
            modelConfigJson: agentRuns.modelConfigJson,
            budgetJson: agentRuns.budgetJson,
            traceId: agentRuns.traceId,
            startedAt: agentRuns.startedAt,
            completedAt: agentRuns.completedAt,
          })
          .from(agentRuns)
          .innerJoin(tutorSessions, eq(agentRuns.sessionId, tutorSessions.id))
          .where(eq(tutorSessions.notebookId, notebookId))
          .orderBy(desc(agentRuns.startedAt))
          .limit(limit),
        ctx.db.db
          .select({
            id: toolCalls.id,
            notebookId: tutorSessions.notebookId,
            runId: toolCalls.runId,
            sessionId: toolCalls.sessionId,
            turnId: toolCalls.turnId,
            toolName: toolCalls.toolName,
            sideEffectClass: toolCalls.sideEffectClass,
            inputJson: toolCalls.inputJson,
            outputJson: toolCalls.outputJson,
            status: toolCalls.status,
            latencyMs: toolCalls.latencyMs,
            reducerResultJson: toolCalls.reducerResultJson,
            createdAt: toolCalls.createdAt,
          })
          .from(toolCalls)
          .innerJoin(tutorSessions, eq(toolCalls.sessionId, tutorSessions.id))
          .where(eq(tutorSessions.notebookId, notebookId))
          .orderBy(desc(toolCalls.createdAt))
          .limit(limit),
        ctx.db.db
          .select()
          .from(events)
          .where(eq(events.notebookId, notebookId))
          .orderBy(desc(events.createdAt))
          .limit(limit),
        ctx.db.db.select().from(wikiPages).where(eq(wikiPages.notebookId, notebookId)).orderBy(desc(wikiPages.updatedAt)).limit(limit),
        ctx.db.db.select().from(artifacts).where(eq(artifacts.notebookId, notebookId)).orderBy(desc(artifacts.updatedAt)).limit(limit),
        ctx.db.db.select().from(claims).where(eq(claims.notebookId, notebookId)).orderBy(desc(claims.updatedAt)).limit(limit),
        ctx.db.db.select().from(sources).where(eq(sources.notebookId, notebookId)).orderBy(desc(sources.updatedAt)).limit(limit),
        ctx.db.db
          .select({
            id: tutorTurns.id,
            notebookId: tutorSessions.notebookId,
            sessionId: tutorTurns.sessionId,
            turnIndex: tutorTurns.turnIndex,
            selectedNodeRefsJson: tutorTurns.selectedNodeRefsJson,
            userMessage: tutorTurns.userMessage,
            assistantMessage: tutorTurns.assistantMessage,
            createdAt: tutorTurns.createdAt,
          })
          .from(tutorTurns)
          .innerJoin(tutorSessions, eq(tutorTurns.sessionId, tutorSessions.id))
          .where(eq(tutorSessions.notebookId, notebookId))
          .orderBy(desc(tutorTurns.createdAt))
          .limit(limit),
        ctx.db.db
          .select({
            id: masteryEvidence.id,
            notebookId: masteryEvidence.notebookId,
            sessionId: masteryEvidence.sessionId,
            turnId: masteryEvidence.turnId,
            runId: masteryEvidence.runId,
            evidenceJson: masteryEvidence.evidenceJson,
            createdAt: masteryEvidence.createdAt,
          })
          .from(masteryEvidence)
          .where(eq(masteryEvidence.notebookId, notebookId))
          .orderBy(desc(masteryEvidence.createdAt))
          .limit(limit),
      ]);

      const runUsageById = buildRunUsageLookup(eventRows);
      const items: DeveloperTimelineItem[] = [
        ...runRows.map((row) => mapRunRow(row, runUsageById.get(row.id))),
        ...toolRows.map(mapToolRow),
        ...eventRows.map(mapEventRow),
        ...wikiRows.map(mapWikiRow),
        ...artifactRows.map(mapArtifactRow),
        ...claimRows.map(mapClaimRow),
        ...sourceRows.map(mapSourceRow),
        ...turnRows.map(mapTurnRow),
        ...masteryEvidenceRows.map(mapMasteryEvidenceRow),
      ]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit);

      const traceSummary = summarizeTrace(items);
      const response: DeveloperTimelineResponse = {
        notebookId,
        generatedAt: new Date().toISOString(),
        items,
        traceSummary,
      };

      return reply.send(developerTimelineResponseSchema.parse(response));
    },
  );

  app.get<{ Params: { notebookId: string }; Querystring: { limit?: string; sessionId?: string } }>(
    "/notebooks/:notebookId/tutor/trace",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId } = request.params;
      const limit = clampLimit(request.query.limit ?? "80");

      const [owned] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!owned) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      const turnQuery = ctx.db.db
        .select({
          id: tutorTurns.id,
          notebookId: tutorSessions.notebookId,
          sessionId: tutorTurns.sessionId,
          turnIndex: tutorTurns.turnIndex,
          selectedNodeRefsJson: tutorTurns.selectedNodeRefsJson,
          userMessage: tutorTurns.userMessage,
          assistantMessage: tutorTurns.assistantMessage,
          createdAt: tutorTurns.createdAt,
        })
        .from(tutorTurns)
        .innerJoin(tutorSessions, eq(tutorTurns.sessionId, tutorSessions.id))
        .where(
          and(
            eq(tutorSessions.notebookId, notebookId),
            ...(request.query.sessionId ? [eq(tutorTurns.sessionId, request.query.sessionId)] : []),
          ),
        )
        .orderBy(desc(tutorTurns.createdAt))
        .limit(limit);

      const runQuery = ctx.db.db
        .select({
          id: agentRuns.id,
          notebookId: tutorSessions.notebookId,
          sessionId: agentRuns.sessionId,
          turnId: agentRuns.turnId,
          runType: agentRuns.runType,
          status: agentRuns.status,
          modelConfigJson: agentRuns.modelConfigJson,
          budgetJson: agentRuns.budgetJson,
          traceId: agentRuns.traceId,
          startedAt: agentRuns.startedAt,
          completedAt: agentRuns.completedAt,
        })
        .from(agentRuns)
        .innerJoin(tutorSessions, eq(agentRuns.sessionId, tutorSessions.id))
        .where(
          and(
            eq(tutorSessions.notebookId, notebookId),
            ...(request.query.sessionId ? [eq(agentRuns.sessionId, request.query.sessionId)] : []),
          ),
        )
        .orderBy(desc(agentRuns.startedAt))
        .limit(limit);

      const [turnRows, runRows, toolRows, eventRows] = await Promise.all([
        turnQuery,
        runQuery,
        ctx.db.db
          .select({
            id: toolCalls.id,
            notebookId: tutorSessions.notebookId,
            runId: toolCalls.runId,
            sessionId: toolCalls.sessionId,
            turnId: toolCalls.turnId,
            toolName: toolCalls.toolName,
            sideEffectClass: toolCalls.sideEffectClass,
            inputJson: toolCalls.inputJson,
            outputJson: toolCalls.outputJson,
            status: toolCalls.status,
            latencyMs: toolCalls.latencyMs,
            reducerResultJson: toolCalls.reducerResultJson,
            createdAt: toolCalls.createdAt,
          })
          .from(toolCalls)
          .innerJoin(tutorSessions, eq(toolCalls.sessionId, tutorSessions.id))
          .where(
            and(
              eq(tutorSessions.notebookId, notebookId),
              ...(request.query.sessionId ? [eq(toolCalls.sessionId, request.query.sessionId)] : []),
            ),
          )
          .orderBy(desc(toolCalls.createdAt))
          .limit(limit * 4),
        ctx.db.db
          .select()
          .from(events)
          .where(
            and(
              eq(events.notebookId, notebookId),
              ...(request.query.sessionId ? [eq(events.sessionId, request.query.sessionId)] : []),
            ),
          )
          .orderBy(desc(events.createdAt))
          .limit(limit * 6),
      ]);

      const usageByRunId = buildRunUsageLookup(eventRows);
      const toolsByRunId = new Map<string, ChatTraceToolCall[]>();
      for (const row of toolRows) {
        const tool = mapChatTraceTool(row);
        const tools = toolsByRunId.get(row.runId) ?? [];
        tools.push(tool);
        toolsByRunId.set(row.runId, tools);
      }

      const eventsByRunId = new Map<string, ChatTraceStateChange[]>();
      const sessionEvents: ChatTraceStateChange[] = [];
      for (const row of eventRows) {
        const state = mapChatTraceStateChange(mapEventRow(row));
        if (row.runId) {
          const items = eventsByRunId.get(row.runId) ?? [];
          items.push(state);
          eventsByRunId.set(row.runId, items);
        } else if (row.sessionId) {
          sessionEvents.push(state);
        }
      }

      const runsByTurnId = new Map<string, ChatTraceRun[]>();
      for (const row of runRows) {
        const runEvents = [...(eventsByRunId.get(row.id) ?? []), ...sessionEvents].sort(byTimestampAsc);
        const run: ChatTraceRun = {
          id: row.id,
          sessionId: row.sessionId,
          turnId: row.turnId ?? null,
          status: row.status,
          runType: row.runType,
          model: typeof row.modelConfigJson.model === "string" ? row.modelConfigJson.model : undefined,
          promptVersion:
            typeof row.modelConfigJson.promptTemplateVersion === "string"
              ? row.modelConfigJson.promptTemplateVersion
              : undefined,
          traceId: row.traceId,
          startedAt: row.startedAt.toISOString(),
          completedAt: row.completedAt?.toISOString() ?? null,
          durationMs: row.completedAt ? Math.max(0, row.completedAt.getTime() - row.startedAt.getTime()) : null,
          usage: usageByRunId.get(row.id),
          thinking: runEvents.filter((item) => isThinkingEvent(item.eventType)),
          tools: (toolsByRunId.get(row.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          stateChanges: runEvents.filter((item) => isStateChangeEvent(item.eventType)),
          rawEvents: runEvents,
        };
        if (!row.turnId) continue;
        const runs = runsByTurnId.get(row.turnId) ?? [];
        runs.push(run);
        runsByTurnId.set(row.turnId, runs);
      }

      const response: ChatTraceResponse = {
        notebookId,
        generatedAt: new Date().toISOString(),
        turns: turnRows
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((turn) => ({
            id: turn.id,
            sessionId: turn.sessionId,
            turnIndex: turn.turnIndex,
            userMessage: turn.userMessage,
            assistantMessage: turn.assistantMessage,
            createdAt: turn.createdAt.toISOString(),
            runs: (runsByTurnId.get(turn.id) ?? []).sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
          }))
          .map((turn) => ({
            ...turn,
            runs:
              turn.runs.length > 0
                ? turn.runs
                : sessionEvents.length
                  ? [
                      {
                        id: `run_${turn.id}`,
                        sessionId: turn.sessionId,
                        turnId: turn.id,
                        status: "no_run",
                        runType: "session_activity",
                        startedAt: turn.createdAt,
                        completedAt: null,
                        durationMs: null,
                        traceId: null,
                        thinking: [],
                        tools: [],
                        stateChanges: sessionEvents.filter((event) => isStateChangeEvent(event.eventType)),
                        rawEvents: sessionEvents,
                      },
                    ]
                  : [],
          })),
      };

      return reply.send(chatTraceResponseSchema.parse(response));
    },
  );
}

function clampLimit(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 120;
  return Math.min(250, Math.max(25, Math.trunc(parsed)));
}

function buildRunUsageLookup(eventRows: Array<{ runId: string | null; eventType: string; payloadJson: Record<string, unknown> }>): EventLookup {
  const usageByRunId: EventLookup = new Map();
  for (const row of eventRows) {
    if (row.eventType !== "agent.run.completed" || !row.runId) {
      continue;
    }
    usageByRunId.set(row.runId, normalizeTraceUsage(row.payloadJson.usage as never));
  }
  return usageByRunId;
}

function summarizeTrace(items: DeveloperTimelineItem[]): DeveloperTimelineResponse["traceSummary"] {
  const runs = items.filter((item) => item.id.startsWith("run:"));
  const tools = items.filter((item) => item.id.startsWith("tool:"));
  const events = items.filter((item) => item.id.startsWith("event:"));
  const usage = runs.reduce<TraceUsage | undefined>((acc, item) => {
    if (!item.usage) return acc;
    if (!acc) return item.usage;
    return {
      input: acc.input + item.usage.input,
      output: acc.output + item.usage.output,
      cacheRead: acc.cacheRead + item.usage.cacheRead,
      cacheWrite: acc.cacheWrite + item.usage.cacheWrite,
      totalTokens: acc.totalTokens + item.usage.totalTokens,
      cost: {
        input: acc.cost.input + item.usage.cost.input,
        output: acc.cost.output + item.usage.cost.output,
        cacheRead: acc.cost.cacheRead + item.usage.cost.cacheRead,
        cacheWrite: acc.cost.cacheWrite + item.usage.cost.cacheWrite,
        total: acc.cost.total + item.usage.cost.total,
      },
    };
  }, undefined);

  return {
    runCount: runs.length,
    toolCallCount: tools.length,
    eventCount: events.length,
    ...(usage ? { usage } : {}),
  };
}

function mapRunRow(
  row: {
    id: string;
    notebookId: string;
    sessionId: string;
    turnId: string | null;
    runType: string;
    status: string;
    modelConfigJson: Record<string, unknown>;
    traceId: string | null;
    startedAt: Date;
    completedAt: Date | null;
  },
  usage: TraceUsage | undefined,
): DeveloperTimelineItem {
  const model = typeof row.modelConfigJson.model === "string" ? row.modelConfigJson.model : undefined;
  const promptVersion = typeof row.modelConfigJson.promptTemplateVersion === "string" ? row.modelConfigJson.promptTemplateVersion : undefined;
  return {
    id: `run:${row.id}`,
    kind: "agent_run",
    title: `${row.runType.replace(/_/g, " ")} ${row.status}`,
    summary: [model ? `model ${model}` : undefined, promptVersion ? `prompt ${promptVersion}` : undefined, usage ? formatTraceUsage(usage) : undefined]
      .filter(Boolean)
      .join(" · "),
    timestamp: (row.completedAt ?? row.startedAt).toISOString(),
    notebookId: row.notebookId,
    sessionId: row.sessionId,
    runId: row.id,
    traceId: row.traceId ?? undefined,
    model,
    promptVersion,
    status: row.status,
    usage,
    nodeRefs: [],
    payload: { turnId: row.turnId, modelConfig: row.modelConfigJson },
  };
}

function mapToolRow(row: {
  id: string;
  notebookId: string;
  runId: string;
  sessionId: string;
  turnId: string | null;
  toolName: string;
  sideEffectClass: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown> | null;
  status: string;
  latencyMs: number | null;
  reducerResultJson: Record<string, unknown> | null;
  createdAt: Date;
}): DeveloperTimelineItem {
  return {
    id: `tool:${row.id}`,
    kind: "tool_call",
    title: `${row.toolName} ${row.status}`,
    summary: [row.sideEffectClass, row.latencyMs != null ? `${row.latencyMs}ms` : undefined].filter(Boolean).join(" · "),
    timestamp: row.createdAt.toISOString(),
    notebookId: row.notebookId,
    sessionId: row.sessionId,
    runId: row.runId,
    toolCallId: row.id,
    toolName: row.toolName,
    status: row.status,
    nodeRefs: nodeRefsFromPayload(row.inputJson, row.outputJson ?? undefined, row.reducerResultJson ?? undefined),
    payload: { turnId: row.turnId, sideEffectClass: row.sideEffectClass, input: row.inputJson, output: row.outputJson, reducerResult: row.reducerResultJson },
  };
}

function mapChatTraceTool(row: {
  id: string;
  runId: string;
  sessionId: string;
  turnId: string | null;
  toolName: string;
  sideEffectClass: string;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown> | null;
  status: string;
  latencyMs: number | null;
  reducerResultJson: Record<string, unknown> | null;
  createdAt: Date;
}): ChatTraceToolCall {
  return {
    id: row.id,
    runId: row.runId,
    sessionId: row.sessionId,
    turnId: row.turnId,
    toolName: row.toolName,
    sideEffectClass: row.sideEffectClass,
    status: row.status,
    latencyMs: row.latencyMs,
    input: row.inputJson,
    output: row.outputJson,
    reducerResult: row.reducerResultJson,
    nodeRefs: nodeRefsFromPayload(row.inputJson, row.outputJson ?? undefined, row.reducerResultJson ?? undefined),
    createdAt: row.createdAt.toISOString(),
  };
}

function mapChatTraceStateChange(item: DeveloperTimelineItem): ChatTraceStateChange {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    eventType: item.eventType,
    status: item.status,
    nodeRefs: item.nodeRefs,
    payload: item.payload,
    timestamp: item.timestamp,
  };
}

function mapMasteryEvidenceRow(row: {
  id: string;
  notebookId: string;
  sessionId: string | null;
  turnId: string | null;
  runId: string | null;
  evidenceJson: Record<string, unknown>;
  createdAt: Date;
}): DeveloperTimelineItem {
  const evidence = parseMasteryEvidence(row.evidenceJson);
  const summary = evidence
    ? [
        evidence.correctnessLabel,
        `score ${evidence.overallScore.toFixed(2)}`,
        `confidence ${evidence.confidence.toFixed(2)}`,
        `uncertainty ${evidence.uncertainty.toFixed(2)}`,
        evidence.tutoringIntervention,
        evidence.triggerSource,
      ].join(" · ")
    : summarizePayload(row.evidenceJson);

  return {
    id: `mastery_evidence:${row.id}`,
    kind: "mastery_evaluator",
    title: "Mastery evaluator evidence",
    summary,
    timestamp: row.createdAt.toISOString(),
    notebookId: row.notebookId,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ...(row.runId ? { runId: row.runId } : {}),
    eventType: "mastery.evidence.recorded",
    nodeRefs: evidence?.conceptScores.map((entry) => ({ refType: "concept" as const, refId: entry.conceptId })) ?? [],
    payload: {
      masteryEvidenceId: row.id,
      evidence: row.evidenceJson,
      reducerTrace: evidence
        ? {
            conceptDeltas: evidence.conceptScores.map((entry) => ({
              conceptId: entry.conceptId,
              score: entry.score,
              delta: entry.delta,
            })),
            evaluatorProvenance: evidence.evaluatorProvenance,
          }
        : undefined,
    },
  };
}

function mapEventRow(row: {
  id: string;
  notebookId: string;
  sessionId: string | null;
  runId: string | null;
  eventType: string;
  sequenceNo: number;
  payloadJson: Record<string, unknown>;
  createdAt: Date;
}): DeveloperTimelineItem {
  return {
    id: `event:${row.id}`,
    kind: classifyEventKind(row.eventType),
    title: row.eventType.replaceAll(".", " "),
    summary: summarizeLearningEventSummary(row.eventType, row.payloadJson),
    timestamp: row.createdAt.toISOString(),
    notebookId: row.notebookId,
    sessionId: row.sessionId ?? undefined,
    runId: row.runId ?? undefined,
    eventId: row.id,
    eventType: row.eventType,
    status: typeof row.payloadJson.status === "string" ? row.payloadJson.status : undefined,
    usage: normalizeTraceUsage(row.payloadJson.usage as never),
    model: typeof row.payloadJson.model === "string" ? row.payloadJson.model : undefined,
    promptVersion: typeof row.payloadJson.promptTemplateVersion === "string" ? row.payloadJson.promptTemplateVersion : undefined,
    traceId: typeof row.payloadJson.traceId === "string" ? row.payloadJson.traceId : undefined,
    nodeRefs: nodeRefsFromPayload(row.payloadJson),
    payload: { sequenceNo: row.sequenceNo, ...row.payloadJson },
  };
}

function mapWikiRow(row: { id: string; notebookId: string; pageType: string; pageKey: string; title: string; status: string; version: number; updatedAt: Date; sourceClaimIds: string[]; sourceChunkIds: string[] }): DeveloperTimelineItem {
  return {
    id: `wiki:${row.id}`,
    kind: "wiki_change",
    title: `${row.pageType.replace(/_/g, " ")} updated`,
    summary: `${row.title} · v${row.version} · ${row.status}`,
    timestamp: row.updatedAt.toISOString(),
    notebookId: row.notebookId,
    nodeRefs: [{ refType: "wiki_page", refId: row.id }],
    payload: { pageKey: row.pageKey, status: row.status, sourceClaimIds: row.sourceClaimIds, sourceChunkIds: row.sourceChunkIds },
  };
}

function mapArtifactRow(row: { id: string; notebookId: string; artifactType: string; title: string; status: string; updatedAt: Date; sourceNodeRefsJson: unknown[]; sourceClaimIds: string[]; sourceChunkIds: string[] }): DeveloperTimelineItem {
  return {
    id: `artifact:${row.id}`,
    kind: "artifact_change",
    title: `${row.artifactType.replace(/_/g, " ")} ${row.status}`,
    summary: row.title,
    timestamp: row.updatedAt.toISOString(),
    notebookId: row.notebookId,
    artifactId: row.id,
    status: row.status,
    nodeRefs: nodeRefsFromPayload({ sourceNodeRefs: row.sourceNodeRefsJson }),
    payload: { artifactType: row.artifactType, sourceClaimIds: row.sourceClaimIds, sourceChunkIds: row.sourceChunkIds },
  };
}

function mapClaimRow(row: { id: string; notebookId: string; claimType: string; claimText: string; status: string; confidence: number; updatedAt: Date; sourceClaimIds?: string[]; sourceChunkIds?: string[] }): DeveloperTimelineItem {
  return {
    id: `claim:${row.id}`,
    kind: "wiki_change",
    title: `${row.claimType.replace(/_/g, " ")} ${row.status}`,
    summary: row.claimText,
    timestamp: row.updatedAt.toISOString(),
    notebookId: row.notebookId,
    claimId: row.id,
    status: row.status,
    nodeRefs: [{ refType: "claim", refId: row.id }],
    payload: { confidence: row.confidence, sourceClaimIds: row.sourceClaimIds ?? [], sourceChunkIds: row.sourceChunkIds ?? [] },
  };
}

function mapSourceRow(row: { id: string; notebookId: string; title: string; sourceType: string; status: string; updatedAt: Date; metadataJson: Record<string, unknown> }): DeveloperTimelineItem {
  return {
    id: `source:${row.id}`,
    kind: "ingestion_job",
    title: `${row.title} ${row.status}`,
    summary: row.sourceType,
    timestamp: row.updatedAt.toISOString(),
    notebookId: row.notebookId,
    sourceId: row.id,
    status: row.status,
    nodeRefs: [{ refType: "source", refId: row.id }],
    payload: { sourceType: row.sourceType, metadata: row.metadataJson },
  };
}

function mapTurnRow(row: { id: string; notebookId: string; sessionId: string; turnIndex: number; selectedNodeRefsJson: unknown[]; userMessage: string | null; assistantMessage: string | null; createdAt: Date }): DeveloperTimelineItem {
  return {
    id: `turn:${row.id}`,
    kind: "event",
    title: `Tutor turn #${row.turnIndex}`,
    summary: [row.userMessage ?? undefined, row.assistantMessage ? `assistant: ${row.assistantMessage.slice(0, 140)}` : undefined].filter(Boolean).join(" · "),
    timestamp: row.createdAt.toISOString(),
    notebookId: row.notebookId,
    sessionId: row.sessionId,
    nodeRefs: nodeRefsFromPayload({ selectedNodeRefs: row.selectedNodeRefsJson }),
    payload: { turnIndex: row.turnIndex },
  };
}

function summarizeLearningEventSummary(eventType: string, payload: Record<string, unknown>): string {
  if (eventType === "learning.mastery.updated") {
    const masteryScore = typeof payload.masteryScore === "number" ? payload.masteryScore.toFixed(2) : "?";
    const confidence = typeof payload.confidence === "number" ? payload.confidence.toFixed(2) : "?";
    const evidenceId = typeof payload.masteryEvidenceId === "string" ? payload.masteryEvidenceId : "unknown";
    return `reducer applied · mastery ${masteryScore} · confidence ${confidence} · evidence ${evidenceId}`;
  }
  if (eventType === "session_plan.updated" && payload.adaptiveRegeneration) {
    const evidenceId = typeof payload.masteryEvidenceId === "string" ? payload.masteryEvidenceId : null;
    return evidenceId ? `adaptive plan from evidence ${evidenceId}` : "adaptive plan regeneration";
  }
  return summarizePayload(payload);
}

function summarizePayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof payload.safeMessage === "string") parts.push(payload.safeMessage);
  if (typeof payload.model === "string") parts.push(`model ${payload.model}`);
  if (typeof payload.promptTemplateVersion === "string") parts.push(`prompt ${payload.promptTemplateVersion}`);
  const usage = normalizeTraceUsage(payload.usage as never);
  if (usage) parts.push(formatTraceUsage(usage));
  if (typeof payload.message === "string") parts.push(payload.message);
  if (parts.length === 0) {
    const keys = Object.keys(payload).slice(0, 4);
    return keys.join(", ");
  }
  return parts.join(" · ");
}

function nodeRefsFromPayload(...payloads: Array<Record<string, unknown> | undefined>): TimelineNodeRef[] {
  const refs: TimelineNodeRef[] = [];
  const allowedRefTypes = new Set<TimelineNodeRef["refType"]>([
    "tool_call",
    "user",
    "notebook",
    "source",
    "source_version",
    "chunk",
    "concept",
    "claim",
    "curriculum",
    "objective",
    "study_plan",
    "wiki_page",
    "artifact",
    "session",
    "turn",
    "trait_signal",
    "trait_estimate",
    "trait_proposal",
    "trait_guardrail_decision",
    "whiteboard_node",
    "whiteboard_edge",
  ]);
  for (const payload of payloads) {
    if (!payload) continue;
    const candidateRefs = payload.nodeRefs ?? payload.selectedNodeRefs ?? payload.sourceNodeRefs;
    if (!Array.isArray(candidateRefs)) continue;
    for (const ref of candidateRefs) {
      if (!ref || typeof ref !== "object") continue;
      const refType = (ref as { refType?: unknown }).refType;
      const refId = (ref as { refId?: unknown }).refId;
      if (typeof refType === "string" && typeof refId === "string" && allowedRefTypes.has(refType as TimelineNodeRef["refType"])) {
        refs.push({ refType: refType as TimelineNodeRef["refType"], refId });
      }
    }
  }
  return dedupeRefs(refs);
}

function dedupeRefs(refs: TimelineNodeRef[]): TimelineNodeRef[] {
  const seen = new Set<string>();
  const result: TimelineNodeRef[] = [];
  for (const ref of refs) {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

function classifyEventKind(eventType: string): DeveloperTimelineItem["kind"] {
  if (eventType.startsWith("mastery.") || eventType.startsWith("learning.mastery_evidence")) return "mastery_evaluator";
  if (eventType.startsWith("agent.run") || eventType.startsWith("tutor.")) return "agent_run";
  if (eventType.startsWith("agent.tool")) return "tool_call";
  if (eventType.startsWith("source.") || eventType.startsWith("ingestion.job.")) return "ingestion_job";
  if (eventType.startsWith("wiki.")) return "wiki_change";
  if (eventType.startsWith("artifact.")) return "artifact_change";
  return "event";
}

function byTimestampAsc(a: ChatTraceStateChange, b: ChatTraceStateChange): number {
  return a.timestamp.localeCompare(b.timestamp);
}

function isThinkingEvent(eventType: string | undefined): boolean {
  if (!eventType) return false;
  return [
    "session.context.selected",
    "session.context.selection_failed",
    "agent.compaction.started",
    "agent.compaction.completed",
    "agent.run.started",
    "agent.run.completed",
    "agent.run.failed",
    "tutor.message.completed",
  ].includes(eventType);
}

function isStateChangeEvent(eventType: string | undefined): boolean {
  if (!eventType) return false;
  if (eventType === "tutor.message.delta") return false;
  if (eventType.startsWith("agent.tool.")) return false;
  if (isThinkingEvent(eventType)) return false;
  return (
    eventType.startsWith("artifact.") ||
    eventType.startsWith("wiki.") ||
    eventType.startsWith("coverage.") ||
    eventType.startsWith("curriculum.") ||
    eventType.startsWith("module.") ||
    eventType.startsWith("objective") ||
    eventType.startsWith("study_plan.") ||
    eventType.startsWith("session_plan.") ||
    eventType.startsWith("source.") ||
    eventType.startsWith("ingestion.") ||
    eventType.startsWith("graph.") ||
    eventType.startsWith("learning.")
  );
}
