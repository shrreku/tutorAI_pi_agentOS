import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudyAgentEnv } from "@studyagent/config";
import { mirrorToPostHog, scrubAnalyticsProperties } from "./posthog-mirror.js";

function testEnv(overrides: Partial<StudyAgentEnv>): StudyAgentEnv {
  return {
    DATABASE_URL: "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent",
    POSTHOG_HOST: "https://us.i.posthog.com",
    ...overrides,
  } as StudyAgentEnv;
}

describe("posthog mirror", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("scrubs sensitive analytics properties", () => {
    expect(
      scrubAnalyticsProperties({
        templateId: "st_1",
        sourceText: "private",
        transcript: "private",
        masteryDetail: { score: 1 },
        nested: { sourceText: "private", safeCount: 2 },
      }),
    ).toEqual({ templateId: "st_1", nested: { safeCount: 2 } });
  });

  it("no-ops when POSTHOG_API_KEY is unset", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await mirrorToPostHog(testEnv({ POSTHOG_API_KEY: undefined }), {
      event: "consent_accepted",
      distinctId: "usr_1",
      properties: { consentVersion: "2026-06-17" },
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts sanitized capture payloads when configured", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await mirrorToPostHog(
      testEnv({
        POSTHOG_API_KEY: "phc_test",
        POSTHOG_HOST: "https://us.i.posthog.com",
      }),
      {
        event: "template_view",
        distinctId: "usr_1",
        properties: {
          templateId: "st_1",
          sourceText: "secret",
        },
        personProperties: { email: "learner@example.com", name: "Learner" },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, { body?: string }];
    expect(call[0]).toBe("https://us.i.posthog.com/capture/");
    const body = JSON.parse(String(call[1]?.body)) as {
      api_key: string;
      event: string;
      properties: Record<string, unknown>;
    };
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("template_view");
    expect(body.properties.templateId).toBe("st_1");
    expect(body.properties.sourceText).toBeUndefined();
    expect(body.properties.$set).toEqual({
      email: "learner@example.com",
      name: "Learner",
    });
  });

  it("does not fail product operations when PostHog is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network unavailable");
    }));

    await expect(
      mirrorToPostHog(testEnv({ POSTHOG_API_KEY: "phc_test" }), {
        event: "template_view",
        distinctId: "usr_1",
      }),
    ).resolves.toBeUndefined();
  });
});
