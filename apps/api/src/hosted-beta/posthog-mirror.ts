import type { StudyAgentEnv } from "@studyagent/config";
import { sanitizeProductAnalyticsProperties } from "@studyagent/db";

export type PostHogMirrorEvent = {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
  personProperties?: { email?: string; name?: string };
  timestamp?: string;
};

export function scrubAnalyticsProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeProductAnalyticsProperties(properties);
}

export async function mirrorToPostHog(
  env: StudyAgentEnv,
  event: PostHogMirrorEvent,
): Promise<void> {
  if (!env.POSTHOG_API_KEY) {
    return;
  }

  const host = env.POSTHOG_HOST.replace(/\/$/, "");
  const properties = scrubAnalyticsProperties(event.properties ?? {});
  const captureProperties: Record<string, unknown> = {
    ...properties,
    $lib: "studyagent-api-mirror",
  };
  if (event.personProperties && Object.keys(event.personProperties).length > 0) {
    captureProperties.$set = event.personProperties;
  }
  const body = {
    api_key: env.POSTHOG_API_KEY,
    event: event.event,
    distinct_id: event.distinctId,
    properties: captureProperties,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  try {
    const response = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      console.warn(`PostHog mirror failed with status ${response.status}`);
    }
  } catch (error) {
    console.warn(
      `PostHog mirror unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
