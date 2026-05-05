import { describe, expect, it } from "vitest";
import { mapEventEnvelopeToRuntimeStreamChunks, serializeStreamChunkToSse } from "./stream.js";

describe("runtime stream mapping", () => {
  it("maps tutor message events into AG-UI compatible chunks", () => {
    const chunks = mapEventEnvelopeToRuntimeStreamChunks({
      id: "evt_1",
      notebookId: "nb_1",
      sessionId: "sess_1",
      runId: "run_1",
      eventType: "tutor.message.delta",
      sequenceNo: 1,
      createdAt: "2026-05-04T00:00:00.000Z",
      payload: { text: "Hello", speaker: "assistant" },
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.kind).toBe("message-delta");
    expect(chunks[0]?.payload.text).toBe("Hello");
  });

  it("serializes chunks to SSE frames", () => {
    const chunks = mapEventEnvelopeToRuntimeStreamChunks({
      id: "evt_2",
      notebookId: "nb_1",
      eventType: "agent.run.started",
      sequenceNo: 2,
      createdAt: "2026-05-04T00:00:00.000Z",
      payload: { mode: "learn" },
    });

    expect(serializeStreamChunkToSse(chunks[0]!)).toContain("event: run-start");
  });
});