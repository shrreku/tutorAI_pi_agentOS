import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  retryable: z.boolean(),
  traceId: z.string().optional(),
});

export const developerTimelineKindSchema = z.enum([
  "event",
  "agent_run",
  "tool_call",
  "wiki_change",
  "artifact_change",
  "ingestion_job",
  "mastery_evaluator",
]);

export const traceUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cost: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cacheRead: z.number().nonnegative(),
    cacheWrite: z.number().nonnegative(),
    total: z.number().nonnegative(),
  }),
});

export const developerTimelineItemSchema = z.object({
  id: z.string().min(1),
  kind: developerTimelineKindSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  timestamp: z.string().datetime(),
  notebookId: idSchema,
  sessionId: idSchema.optional(),
  runId: idSchema.optional(),
  traceId: z.string().optional(),
  eventId: idSchema.optional(),
  eventType: z.string().optional(),
  toolCallId: idSchema.optional(),
  toolName: z.string().optional(),
  artifactId: idSchema.optional(),
  claimId: idSchema.optional(),
  sourceId: idSchema.optional(),
  sourceVersionId: idSchema.optional(),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  status: z.string().optional(),
  usage: traceUsageSchema.optional(),
  nodeRefs: z.array(nodeRefSchema).default([]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const developerTimelineResponseSchema = z.object({
  notebookId: idSchema,
  generatedAt: z.string().datetime(),
  items: z.array(developerTimelineItemSchema),
  traceSummary: z.object({
    runCount: z.number().int().nonnegative(),
    toolCallCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    usage: traceUsageSchema.optional(),
  }),
});

export const chatTraceToolCallSchema = z.object({
  id: idSchema,
  runId: idSchema,
  sessionId: idSchema,
  turnId: idSchema.nullable().optional(),
  toolName: z.string().min(1),
  sideEffectClass: z.string().min(1),
  status: z.string().min(1),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).nullable().optional(),
  reducerResult: z.record(z.string(), z.unknown()).nullable().optional(),
  nodeRefs: z.array(nodeRefSchema).default([]),
  createdAt: z.string().datetime(),
});

export const chatTraceStateChangeSchema = z.object({
  id: z.string().min(1),
  kind: developerTimelineKindSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  eventType: z.string().optional(),
  status: z.string().optional(),
  nodeRefs: z.array(nodeRefSchema).default([]),
  payload: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string().datetime(),
});

export const chatTraceRunSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  turnId: idSchema.nullable().optional(),
  status: z.string().min(1),
  runType: z.string().min(1),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  traceId: z.string().nullable().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  usage: traceUsageSchema.optional(),
  thinking: z.array(chatTraceStateChangeSchema).default([]),
  tools: z.array(chatTraceToolCallSchema).default([]),
  stateChanges: z.array(chatTraceStateChangeSchema).default([]),
  rawEvents: z.array(chatTraceStateChangeSchema).default([]),
});

export const chatTraceTurnSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  turnIndex: z.number().int().nonnegative(),
  userMessage: z.string().nullable().optional(),
  assistantMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  runs: z.array(chatTraceRunSchema).default([]),
});

export const chatTraceResponseSchema = z.object({
  notebookId: idSchema,
  generatedAt: z.string().datetime(),
  turns: z.array(chatTraceTurnSchema).default([]),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type DeveloperTimelineKind = z.infer<typeof developerTimelineKindSchema>;
export type TraceUsage = z.infer<typeof traceUsageSchema>;
export type DeveloperTimelineItem = z.infer<typeof developerTimelineItemSchema>;
export type DeveloperTimelineResponse = z.infer<typeof developerTimelineResponseSchema>;
export type ChatTraceToolCall = z.infer<typeof chatTraceToolCallSchema>;
export type ChatTraceStateChange = z.infer<typeof chatTraceStateChangeSchema>;
export type ChatTraceRun = z.infer<typeof chatTraceRunSchema>;
export type ChatTraceTurn = z.infer<typeof chatTraceTurnSchema>;
export type ChatTraceResponse = z.infer<typeof chatTraceResponseSchema>;
