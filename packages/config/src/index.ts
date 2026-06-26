import { z } from "zod";
import { validateProductionEnv } from "./production-guards.js";

function envBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value !== "string") {
      return value;
    }
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
    return value;
  }, z.boolean().default(defaultValue));
}

const optionalUrl = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().url().optional(),
);
const optionalDateTime = z.preprocess(
  (value) => {
    if (value == null) {
      return undefined;
    }
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === "" || trimmed === "0" ? undefined : trimmed;
  },
  z.string().datetime({ offset: true }).optional(),
);
const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().min(1).optional(),
);
const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);
const optionalMinLengthString = (minimum: number) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.string().min(minimum).optional(),
  );

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DEV_USER_EMAIL: z.string().email().default("dev@studyagent.local"),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_BUCKET: z.string().default("studyagent-local"),
  OBJECT_STORAGE_ACCESS_KEY: z.string().optional(),
  OBJECT_STORAGE_SECRET_KEY: z.string().optional(),
  OBJECT_STORAGE_REGION: z.string().default("us-east-1"),
  REDIS_URL: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().url().optional(),
  ),
  NEO4J_URI: z.string().default("neo4j://localhost:7687"),
  NEO4J_USERNAME: z.string().default("neo4j"),
  NEO4J_PASSWORD: z.string().default("studyagent-local"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),
  LANGFUSE_TRACING_ENVIRONMENT: z.string().optional(),
  LANGFUSE_RELEASE: z.string().optional(),
  LANGFUSE_FLUSH_AT: optionalPositiveInt,
  LANGFUSE_FLUSH_INTERVAL: optionalPositiveInt,
  LANGFUSE_PROMPT_LABEL: z.string().default("production"),
  LANGFUSE_PROMPT_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(300),
  LANGFUSE_PROMPT_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  LANGFUSE_TUTOR_PROMPT_NAME: z.string().default("studyagent-tutor-system"),
  /** When unset or empty, embeddings use {@link OPENROUTER_BASE_URL} (OpenAI-compatible `/embeddings`). */
  EMBEDDING_API_BASE_URL: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().url().optional(),
  ),
  DEFAULT_TUTOR_MODEL: z.string().default("openrouter/auto"),
  /** Wall-clock budget for wiki polish, extraction, and other non-tutor LLM JSON calls. */
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  /** Max tool calls allowed per tutor run before budget exhaustion. */
  TUTOR_MAX_TOOL_CALLS: z.coerce.number().int().positive().default(16),
  /** Max number of prior turns to rehydrate into a recreated Pi runtime session. */
  TUTOR_REHYDRATE_TURN_LIMIT: z.coerce.number().int().positive().default(5),
  DEFAULT_EXTRACTION_MODEL: z.string().default("openrouter/auto"),
  GEMINI_API_KEY: z.string().optional(),
  /** Short names (e.g. `gemini-embedding-2`) are mapped to OpenRouter model IDs in `@studyagent/search`. */
  EMBEDDING_MODEL: z.string().default("gemini-embedding-2"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  LLAMAPARSE_API_KEY: z.string().optional(),
  LLAMAPARSE_API_BASE_URL: z.string().url().default("https://api.cloud.llamaindex.ai"),
  LLAMAPARSE_TIER: z
    .enum(["fast", "cost_effective", "agentic", "agentic_plus"])
    .default("cost_effective"),
  SESSION_SECRET: z.string().min(16).default("studyagent-local-session-secret"),
  PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:4000"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  ENABLE_DEV_TOOLS: envBoolean(true),
  ENABLE_LIVE_LLM_TESTS: envBoolean(false),
  DISABLE_AUTH: envBoolean(true),
  /** WorkOS AuthKit for hosted identity. When unset, hosted auth uses session cookies in test mode. */
  WORKOS_API_KEY: z.string().optional(),
  WORKOS_CLIENT_ID: z.string().optional(),
  WORKOS_REDIRECT_URI: optionalUrl,
  WORKOS_COOKIE_PASSWORD: optionalMinLengthString(32),
  PUBLIC_WEB_BASE_URL: z.string().url().default("http://localhost:5173"),
  BETA_CONSENT_VERSION: z.string().default("2026-06-25"),
  TRIAL_TUTOR_BUDGET_CENTS: z.coerce.number().int().positive().default(100),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default("https://us.i.posthog.com"),
  POSTHOG_REPLAY_ENABLED: envBoolean(false),
  POSTHOG_REPLAY_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
  POSTHOG_REPLAY_DISABLED_UNTIL: optionalDateTime,
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAID_CREDIT_CHECKOUT_ENABLED: envBoolean(false),
  INGESTION_TRIGGER_MODE: z.enum(["inline", "external", "disabled"]).default("inline"),
  INGESTION_TRIGGER_URL: optionalUrl,
  INGESTION_TRIGGER_TOKEN: optionalNonEmptyString,
  INGESTION_TRIGGER_MAX_JOBS: z.coerce.number().int().positive().max(25).default(5),
  INGESTION_TRIGGER_MIN_INTERVAL_SECONDS: z.coerce.number().int().nonnegative().default(0),
  MAX_WORKSPACES_PER_LEARNER: z.coerce.number().int().positive().default(5),
  MAX_QUEUED_SOURCES_PER_LEARNER: z.coerce.number().int().positive().default(10),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
  CREDIT_RESERVATION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60),
});

export type StudyAgentEnv = z.infer<typeof envSchema>;

export { validateProductionEnv } from "./production-guards.js";

export function loadEnv(input: NodeJS.ProcessEnv = process.env): StudyAgentEnv {
  const env = envSchema.parse(input);
  validateProductionEnv(env, input.NODE_ENV);
  return env;
}
