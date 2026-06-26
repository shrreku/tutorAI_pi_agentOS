import { describe, expect, it } from "vitest";
import { captureException, initSentry, resetSentryForTests, scrubEvent, scrubRecord } from "./sentry.js";

describe("Sentry scrubbing", () => {
  it("scrubs sensitive keys from context records", () => {
    const scrubbed = scrubRecord({
      authorization: "Bearer secret-token",
      cookie: "sa_session=abc",
      sourceText: "private chapter text",
      transcript: "learner asked about ...",
      route: "/api/v1/tutor/turn",
      traceId: "trace_123",
    });

    expect(scrubbed).toEqual({
      authorization: "[Filtered]",
      cookie: "[Filtered]",
      sourceText: "[Filtered]",
      transcript: "[Filtered]",
      route: "/api/v1/tutor/turn",
      traceId: "trace_123",
    });
  });

  it("scrubs request headers, cookies, and nested extras from events", () => {
    const scrubbed = scrubEvent({
      message: "private source text",
      exception: { values: [{ type: "Error", value: "learner transcript" }] },
      request: {
        headers: {
          Authorization: "Bearer secret",
          "X-StudyAgent-Trace-Id": "trace_1",
        },
        cookies: {
          sa_session: "token",
        },
        data: {
          transcript: "hello",
        },
      },
      extra: {
        source_text: "chapter 1",
        notebookId: "nb_1",
      },
      breadcrumbs: [
        {
          message: "request",
          data: {
            cookie: "sa_session=token",
            method: "POST",
          },
        },
      ],
    });

    expect(scrubbed.message).toBe("[Filtered]");
    expect(scrubbed.exception?.values?.[0]?.value).toBe("[Filtered]");
    expect(scrubbed.request?.headers).toEqual({
      Authorization: "[Filtered]",
      "X-StudyAgent-Trace-Id": "trace_1",
    });
    expect(scrubbed.request?.cookies).toEqual({ sa_session: "[Filtered]" });
    expect(scrubbed.request?.data).toEqual({ transcript: "[Filtered]" });
    expect(scrubbed.extra).toEqual({
      source_text: "[Filtered]",
      notebookId: "nb_1",
    });
    expect(scrubbed.breadcrumbs?.[0]?.data).toEqual({
      cookie: "[Filtered]",
      method: "POST",
    });
    expect(scrubbed.breadcrumbs?.[0]?.message).toBe("[Filtered]");
  });

  it("no-ops init and capture when dsn is unset", () => {
    resetSentryForTests();
    initSentry(undefined, "test", "release");
    expect(() =>
      captureException(new Error("boom"), {
        authorization: "Bearer secret",
        cookie: "sa_session=abc",
      }),
    ).not.toThrow();
  });
});
