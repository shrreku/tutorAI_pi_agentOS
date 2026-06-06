import { describe, expect, it } from "vitest";
import {
  createCorrelationContext,
  createRequestId,
  createW3CSpanId,
  createW3CTraceId,
  formatTraceparent,
  parseTraceparent,
} from "./index.js";

const validTraceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

describe("correlation context", () => {
  it("parses valid W3C traceparent headers", () => {
    expect(parseTraceparent(validTraceparent)).toEqual({
      version: "00",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      parentSpanId: "00f067aa0ba902b7",
      traceFlags: "01",
    });
  });

  it("rejects invalid traceparent identifiers", () => {
    expect(parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBeNull();
    expect(parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01")).toBeNull();
    expect(parseTraceparent("not-a-traceparent")).toBeNull();
  });

  it("creates a correlation context from an incoming traceparent", () => {
    const context = createCorrelationContext({
      traceparent: validTraceparent,
      requestId: "request_1",
      sessionId: "sess_1",
      runId: "run_1",
    });

    expect(context.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(context.traceFlags).toBe("01");
    expect(context.requestId).toBe("request_1");
    expect(context.sessionId).toBe("sess_1");
    expect(context.runId).toBe("run_1");
    expect(context.parentSpanId).toMatch(/^[0-9a-f]{16}$/);
    expect(context.parentSpanId).not.toBe("00f067aa0ba902b7");
    expect(context.traceparent).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
  });

  it("generates W3C-compatible IDs when no valid carrier exists", () => {
    const traceId = createW3CTraceId();
    const spanId = createW3CSpanId();

    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(traceId).not.toBe("00000000000000000000000000000000");
    expect(spanId).not.toBe("0000000000000000");
    expect(createRequestId()).toMatch(/^req_[0-9a-f]{32}$/);

    const context = createCorrelationContext({ traceparent: "bad" });
    expect(context.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(context.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
  });

  it("formats traceparent using valid caller IDs", () => {
    expect(
      formatTraceparent({
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        parentSpanId: "00f067aa0ba902b7",
        traceFlags: "01",
      }),
    ).toBe(validTraceparent);
  });
});
