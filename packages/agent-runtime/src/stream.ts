import type { EventEnvelope, RuntimeStreamChunk, RuntimeStreamChunkKind } from "@studyagent/schemas";
import { runtimeStreamChunkSchema } from "@studyagent/schemas";

type StreamMapping = {
  kind: RuntimeStreamChunkKind;
  payload: Record<string, unknown>;
};

export function mapEventEnvelopeToRuntimeStreamChunks(event: EventEnvelope): RuntimeStreamChunk[] {
  const mapping = mapEventToChunk(event);
  if (!mapping) {
    return [];
  }

  return [
    runtimeStreamChunkSchema.parse({
      kind: mapping.kind,
      eventType: event.eventType,
      notebookId: event.notebookId,
      sessionId: event.sessionId,
      runId: event.runId,
      sequenceNo: event.sequenceNo,
      createdAt: event.createdAt,
      payload: { ...event.payload, ...mapping.payload },
    }),
  ];
}

export function serializeStreamChunkToSse(chunk: RuntimeStreamChunk): string {
  return [`event: ${chunk.kind}`, `data: ${JSON.stringify(chunk)}`, ""].join("\n");
}

function mapEventToChunk(event: EventEnvelope): StreamMapping | null {
  switch (event.eventType) {
    case "agent.run.started":
      return { kind: "run-start", payload: { phase: "started" } };
    case "agent.run.completed":
      return {
        kind: "run-complete",
        payload: {
          phase: "completed",
          ...(typeof event.payload.usage === "object" && event.payload.usage !== null ? { usage: event.payload.usage } : {}),
          ...(typeof event.payload.model === "string" ? { model: event.payload.model } : {}),
          ...(typeof event.payload.promptTemplateVersion === "string" ? { promptTemplateVersion: event.payload.promptTemplateVersion } : {}),
        },
      };
    case "agent.run.failed":
      return { kind: "run-error", payload: { phase: "failed" } };
    case "agent.compaction.started":
      return { kind: "compaction-start", payload: { phase: "started" } };
    case "agent.compaction.completed":
      return { kind: "compaction-complete", payload: { phase: "completed" } };
    case "agent.tool.started":
      return { kind: "tool-start", payload: { phase: "started" } };
    case "agent.tool.completed":
      return { kind: "tool-complete", payload: { phase: "completed" } };
    case "agent.tool.failed":
      return { kind: "tool-error", payload: { phase: "failed" } };
    case "tutor.message.delta":
      return { kind: "message-delta", payload: { text: extractText(event.payload) } };
    case "tutor.message.completed":
      return { kind: "message-complete", payload: { text: extractText(event.payload) } };
    default:
      return null;
  }
}

function extractText(payload: Record<string, unknown>): string {
  const candidate = payload.text ?? payload.delta ?? payload.message ?? payload.content;
  return typeof candidate === "string" ? candidate : "";
}