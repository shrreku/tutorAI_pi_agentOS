import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  agentRuns,
  artifacts,
  claims,
  events,
  notebooks,
  sources,
  toolCalls,
  tutorSessions,
  tutorTurns,
  wikiPages,
} from "@studyagent/db";
import {
  developerTimelineResponseSchema,
  type DeveloperTimelineItem,
  type DeveloperTimelineResponse,
  type TraceUsage,
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

      const [runRows, toolRows, eventRows, wikiRows, artifactRows, claimRows, sourceRows, turnRows] = await Promise.all([
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
  const runs = items.filter((item) => item.kind === "agent_run");
  const tools = items.filter((item) => item.kind === "tool_call");
  const events = items.filter((item) => item.kind === "event");
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
    summary: summarizePayload(row.payloadJson),
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
  if (eventType.startsWith("agent.run") || eventType.startsWith("tutor.")) return "agent_run";
  if (eventType.startsWith("agent.tool")) return "tool_call";
  if (eventType.startsWith("source.") || eventType.startsWith("ingestion.job.")) return "ingestion_job";
  if (eventType.startsWith("wiki.")) return "wiki_change";
  if (eventType.startsWith("artifact.")) return "artifact_change";
  return "event";
}
