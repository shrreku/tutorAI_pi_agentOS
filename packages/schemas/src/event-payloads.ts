import { z } from "zod";
import { idSchema } from "./ids.js";
import { eventTypeSchema, type EventType } from "./events.js";

const sourcePayloadSchema = z.object({
  sourceId: idSchema.optional(),
  sourceVersionId: idSchema.optional(),
  jobId: idSchema.optional(),
  jobName: z.string().optional(),
  queueBackend: z.enum(["bullmq", "postgres"]).optional(),
  status: z.string().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
  terminalStatus: z.string().optional(),
});

const artifactPayloadSchema = z.object({
  artifactId: idSchema,
  artifactType: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
});

const sessionPayloadSchema = z.object({
  sessionId: idSchema.optional(),
  action: z.string().optional(),
  artifactId: idSchema.optional(),
  currentObjective: z.string().optional(),
});

const learningPayloadSchema = z.object({
  conceptId: idSchema.optional(),
  conceptIds: z.array(idSchema).optional(),
  objectiveId: idSchema.optional(),
  masteryEvidenceId: idSchema.optional(),
  evidenceId: idSchema.optional(),
});

const graphPayloadSchema = z.object({
  sourceId: idSchema.optional(),
  notebookId: idSchema.optional(),
  error: z.string().optional(),
});

const curriculumPayloadSchema = z.object({
  curriculumId: idSchema.optional(),
  moduleId: idSchema.optional(),
  objectiveId: idSchema.optional(),
  studyPlanId: idSchema.optional(),
  reason: z.string().optional(),
});

const wikiPayloadSchema = z.object({
  pageId: idSchema.optional(),
  claimId: idSchema.optional(),
  sourceId: idSchema.optional(),
  status: z.string().optional(),
  reason: z.string().optional(),
});

const tutorPayloadSchema = z.object({
  sessionId: idSchema.optional(),
  turnId: idSchema.optional(),
  messageId: idSchema.optional(),
  checkpointId: idSchema.optional(),
}).passthrough();

const eventPayloadSchemas: Partial<Record<EventType, z.ZodType<Record<string, unknown>>>> = {};

for (const eventType of eventTypeSchema.options) {
  if (eventType.startsWith("source.") || eventType.startsWith("ingestion.")) {
    eventPayloadSchemas[eventType] = sourcePayloadSchema;
  } else if (eventType.startsWith("artifact.")) {
    eventPayloadSchemas[eventType] = artifactPayloadSchema;
  } else if (eventType.startsWith("session.")) {
    eventPayloadSchemas[eventType] = sessionPayloadSchema;
  } else if (eventType.startsWith("learning.")) {
    eventPayloadSchemas[eventType] = learningPayloadSchema;
  } else if (eventType.startsWith("graph.")) {
    eventPayloadSchemas[eventType] = graphPayloadSchema;
  } else if (
    eventType.startsWith("curriculum.") ||
    eventType.startsWith("module.") ||
    eventType.startsWith("objective") ||
    eventType.startsWith("study_plan.")
  ) {
    eventPayloadSchemas[eventType] = curriculumPayloadSchema;
  } else if (eventType.startsWith("wiki.")) {
    eventPayloadSchemas[eventType] = wikiPayloadSchema;
  } else if (eventType.startsWith("tutor.")) {
    eventPayloadSchemas[eventType] = tutorPayloadSchema;
  }
}

export function validateEventPayload(
  eventType: string,
  payload: unknown,
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const parsedType = eventTypeSchema.safeParse(eventType);
  if (!parsedType.success) {
    return { success: false, error: `Unknown event type: ${eventType}` };
  }
  const schema = eventPayloadSchemas[parsedType.data];
  if (!schema) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return { success: true, data: payload as Record<string, unknown> };
    }
    return { success: true, data: {} };
  }
  const parsed = schema.safeParse(payload ?? {});
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  return { success: true, data: parsed.data };
}
