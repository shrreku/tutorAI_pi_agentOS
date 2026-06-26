import { describe, expect, it } from "vitest";
import { loadEnv } from "./index.js";

function productionEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://studyagent:studyagent@db.example.com:5432/studyagent",
    SESSION_SECRET: "production-session-secret",
    DISABLE_AUTH: "false",
    WORKOS_API_KEY: "sk_test_workos",
    WORKOS_CLIENT_ID: "client_test_workos",
    WORKOS_REDIRECT_URI: "https://tutorbook.me/auth/callback",
    WORKOS_COOKIE_PASSWORD: "x".repeat(32),
    PUBLIC_WEB_BASE_URL: "https://tutorbook.me",
    PUBLIC_API_BASE_URL: "https://api.tutorbook.me",
    OBJECT_STORAGE_ENDPOINT: "https://storage.example.com",
    OBJECT_STORAGE_BUCKET: "studyagent",
    OBJECT_STORAGE_ACCESS_KEY: "storage_access",
    OBJECT_STORAGE_SECRET_KEY: "storage_secret",
    OBJECT_STORAGE_REGION: "auto",
    OPENROUTER_API_KEY: "sk-or-test",
    SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
    POSTHOG_API_KEY: "phc_test",
    ...overrides,
  };
}

describe("production environment guards", () => {
  it("accepts a complete hosted production auth and provider configuration", () => {
    const env = loadEnv(
      productionEnv({
        INGESTION_TRIGGER_MAX_JOBS: "2",
        INGESTION_TRIGGER_MIN_INTERVAL_SECONDS: "300",
      }),
    );

    expect(env.DISABLE_AUTH).toBe(false);
    expect(env.WORKOS_REDIRECT_URI).toBe("https://tutorbook.me/auth/callback");
    expect(env.INGESTION_TRIGGER_MAX_JOBS).toBe(2);
    expect(env.INGESTION_TRIGGER_MIN_INTERVAL_SECONDS).toBe(300);
  });

  it("rejects production dev auth", () => {
    expect(() => loadEnv(productionEnv({ DISABLE_AUTH: "true" }))).toThrow(
      /DISABLE_AUTH must be false in production/,
    );
  });

  it("rejects a WorkOS redirect URI outside the public web origin", () => {
    expect(() =>
      loadEnv(productionEnv({ WORKOS_REDIRECT_URI: "https://api.tutorbook.me/auth/callback" })),
    ).toThrow(/WORKOS_REDIRECT_URI must be under PUBLIC_WEB_BASE_URL in production/);
  });

  it("rejects non-HTTPS WorkOS redirect URIs in production", () => {
    expect(() =>
      loadEnv(productionEnv({ WORKOS_REDIRECT_URI: "http://tutorbook.me/auth/callback" })),
    ).toThrow(/WORKOS_REDIRECT_URI must use https in production/);
  });
});
