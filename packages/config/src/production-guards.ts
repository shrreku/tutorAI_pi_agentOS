import type { StudyAgentEnv } from "./index.js";

const LOCAL_SESSION_SECRET = "studyagent-local-session-secret";

export function validateProductionEnv(env: StudyAgentEnv, nodeEnv = process.env.NODE_ENV): void {
  if (nodeEnv !== "production") {
    return;
  }

  const errors: string[] = [];

  if (env.DISABLE_AUTH) {
    errors.push("DISABLE_AUTH must be false in production");
  }
  if (env.SESSION_SECRET === LOCAL_SESSION_SECRET) {
    errors.push("SESSION_SECRET must not use the local default in production");
  }
  if (!env.WORKOS_API_KEY || !env.WORKOS_CLIENT_ID) {
    errors.push("WORKOS_API_KEY and WORKOS_CLIENT_ID are required in production");
  }
  if (!env.WORKOS_REDIRECT_URI) {
    errors.push("WORKOS_REDIRECT_URI is required in production");
  } else if (!env.WORKOS_REDIRECT_URI.startsWith("https://")) {
    errors.push("WORKOS_REDIRECT_URI must use https in production");
  }
  if (!env.WORKOS_COOKIE_PASSWORD) {
    errors.push("WORKOS_COOKIE_PASSWORD is required in production");
  }
  if (!env.PUBLIC_WEB_BASE_URL.startsWith("https://")) {
    errors.push("PUBLIC_WEB_BASE_URL must use https in production");
  }
  if (!env.PUBLIC_API_BASE_URL.startsWith("https://")) {
    errors.push("PUBLIC_API_BASE_URL must use https in production");
  }
  if (
    env.WORKOS_REDIRECT_URI &&
    env.PUBLIC_WEB_BASE_URL.startsWith("https://") &&
    !env.WORKOS_REDIRECT_URI.startsWith(`${env.PUBLIC_WEB_BASE_URL.replace(/\/$/, "")}/`)
  ) {
    errors.push("WORKOS_REDIRECT_URI must be under PUBLIC_WEB_BASE_URL in production");
  }
  if (
    !env.OBJECT_STORAGE_ENDPOINT ||
    !env.OBJECT_STORAGE_ACCESS_KEY ||
    !env.OBJECT_STORAGE_SECRET_KEY
  ) {
    errors.push(
      "OBJECT_STORAGE_ENDPOINT, OBJECT_STORAGE_ACCESS_KEY, and OBJECT_STORAGE_SECRET_KEY are required in production",
    );
  }
  if (!env.OPENROUTER_API_KEY) {
    errors.push("OPENROUTER_API_KEY is required in production");
  }
  if (!env.SENTRY_DSN) {
    errors.push("SENTRY_DSN is required in production");
  }
  if (!env.POSTHOG_API_KEY) {
    errors.push("POSTHOG_API_KEY is required in production");
  }
  if (
    env.INGESTION_TRIGGER_MODE === "external" &&
    (!env.INGESTION_TRIGGER_URL || !env.INGESTION_TRIGGER_TOKEN)
  ) {
    errors.push(
      "INGESTION_TRIGGER_URL and INGESTION_TRIGGER_TOKEN are required for external ingestion triggers",
    );
  }
  if (env.PAID_CREDIT_CHECKOUT_ENABLED && (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)) {
    errors.push(
      "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required when paid checkout is enabled",
    );
  }

  if (errors.length > 0) {
    throw new Error(`Production configuration invalid:\n- ${errors.join("\n- ")}`);
  }
}
