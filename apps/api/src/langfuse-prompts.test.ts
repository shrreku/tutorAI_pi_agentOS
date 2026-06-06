import { describe, expect, it } from "vitest";
import {
  resolveStudyAgentTutorSystemPrompt,
  studyAgentTutorSystemPromptDefinition,
} from "./langfuse-prompts.js";
import type { AppContext } from "./context.js";

const env = {
  DATABASE_URL: "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent",
  API_PORT: 4000,
  DEV_USER_EMAIL: "dev@studyagent.local",
  OBJECT_STORAGE_BUCKET: "studyagent-local",
  OBJECT_STORAGE_REGION: "us-east-1",
  NEO4J_URI: "neo4j://localhost:7687",
  NEO4J_USERNAME: "neo4j",
  NEO4J_PASSWORD: "studyagent-local",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
  LANGFUSE_TUTOR_PROMPT_NAME: "studyagent-tutor-system",
  LANGFUSE_PROMPT_LABEL: "production",
  LANGFUSE_PROMPT_CACHE_TTL_SECONDS: 300,
  LANGFUSE_PROMPT_FETCH_TIMEOUT_MS: 3000,
  DEFAULT_TUTOR_MODEL: "openrouter/auto",
  DEFAULT_EXTRACTION_MODEL: "openrouter/auto",
  EMBEDDING_MODEL: "gemini-embedding-2",
  EMBEDDING_DIMENSIONS: 1536,
  LLAMAPARSE_API_BASE_URL: "https://api.cloud.llamaindex.ai",
  LLAMAPARSE_TIER: "cost_effective",
  SESSION_SECRET: "studyagent-local-session-secret",
  PUBLIC_API_BASE_URL: "http://localhost:4000",
  LOG_LEVEL: "info",
  ENABLE_DEV_TOOLS: true,
  ENABLE_LIVE_LLM_TESTS: false,
  DISABLE_AUTH: true,
  TUTOR_MODEL_TIMEOUT_MS: 120_000,
  TUTOR_MAX_TOOL_CALLS: 16,
  TUTOR_REHYDRATE_TURN_LIMIT: 5,
} satisfies AppContext["env"];

describe("Langfuse prompt management", () => {
  it("defines the StudyAgent tutor system prompt for explicit Langfuse sync", () => {
    const definition = studyAgentTutorSystemPromptDefinition(env);

    expect(definition.name).toBe("studyagent-tutor-system");
    expect(definition.labels).toEqual(["production"]);
    expect(definition.tags).toEqual(["studyagent", "tutor", "system"]);
    expect(definition.prompt).toContain("{{notebookContext}}");
    expect(definition.prompt).toContain("{{additionalInstructions}}");
    expect(definition.config).toEqual(
      expect.objectContaining({
        promptTemplateVersion: "v1",
        owner: "api-runtime",
      }),
    );
  });

  it("resolves a local fallback prompt when Langfuse is not configured", async () => {
    const resolved = await resolveStudyAgentTutorSystemPrompt(env, {
      notebookTitle: "Linear Algebra",
      activeMode: "learn",
      selectedNodeRefs: [],
      currentObjective: "Understand vectors",
    });

    expect(resolved.metadata).toEqual(
      expect.objectContaining({
        name: "studyagent-tutor-system",
        label: "production",
        isFallback: true,
        source: "local_fallback",
      }),
    );
    expect(resolved.prompt).toContain("Notebook: Linear Algebra");
    expect(resolved.prompt).toContain("Current objective: Understand vectors");
  });
});
