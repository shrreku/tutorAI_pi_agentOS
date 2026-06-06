import { describe, expect, it } from "vitest";
import { eventEnvelopeFromRow, parseEventNotificationPayload } from "./events-stream.js";

describe("eventEnvelopeFromRow", () => {
  it("attaches refreshHint for source readiness events", () => {
    const envelope = eventEnvelopeFromRow({
      id: "evt_1",
      notebookId: "nb_1",
      sessionId: "sess_1",
      runId: "run_1",
      eventType: "source.readiness.updated",
      sequenceNo: 9,
      createdAt: new Date("2026-05-31T01:00:00.000Z"),
      payloadJson: {
        sourceId: "src_1",
      },
    });

    expect(envelope.refreshHint).toBeTruthy();
    expect(envelope.refreshHint).toMatchObject({
      targets: expect.arrayContaining(["sources", "graph"]),
    });
  });

  it("maps nullable session and run ids safely", () => {
    const envelope = eventEnvelopeFromRow({
      id: "evt_2",
      notebookId: "nb_1",
      sessionId: null,
      runId: null,
      eventType: "wiki.page.updated",
      sequenceNo: 10,
      createdAt: new Date("2026-05-31T01:00:00.000Z"),
      payloadJson: null,
    });

    expect(envelope.sessionId).toBeUndefined();
    expect(envelope.runId).toBeUndefined();
    expect(envelope.payload).toEqual({});
    expect(envelope.refreshHint).toBeTruthy();
  });
});

describe("parseEventNotificationPayload", () => {
  it("parses compact Postgres event notifications", () => {
    expect(
      parseEventNotificationPayload(
        JSON.stringify({
          notebookId: "nb_1",
          sessionId: "sess_1",
          sequenceNo: 12,
          eventType: "source.tutoring_ready",
        }),
      ),
    ).toEqual({
      notebookId: "nb_1",
      sessionId: "sess_1",
      sequenceNo: 12,
      eventType: "source.tutoring_ready",
    });
  });

  it("rejects malformed notifications", () => {
    expect(parseEventNotificationPayload("not-json")).toBeNull();
    expect(parseEventNotificationPayload(JSON.stringify({ notebookId: "nb_1" }))).toBeNull();
  });
});
