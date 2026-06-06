import { z } from "zod";

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
  LANGFUSE_FLUSH_AT: z.coerce.number().int().positive().optional(),
  LANGFUSE_FLUSH_INTERVAL: z.coerce.number().int().positive().optional(),
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
  /** Wall-clock budget for a single Pi tutor dispatch (model + tool loop). */
  TUTOR_MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
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
  LLAMAPARSE_TIER: z.enum(["fast", "cost_effective", "agentic", "agentic_plus"]).default("cost_effective"),
  SESSION_SECRET: z.string().min(16).default("studyagent-local-session-secret"),
  PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:4000"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  ENABLE_DEV_TOOLS: z.coerce.boolean().default(true),
  ENABLE_LIVE_LLM_TESTS: z.coerce.boolean().default(false),
  DISABLE_AUTH: z.coerce.boolean().default(true),
});

export type StudyAgentEnv = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): StudyAgentEnv {
  return envSchema.parse(input);
}
