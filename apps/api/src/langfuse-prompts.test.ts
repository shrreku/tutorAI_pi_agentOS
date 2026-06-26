import { describe, expect, it } from "vitest";
import { loadEnv } from "@studyagent/config";
import {
  resolveStudyAgentTutorSystemPrompt,
  studyAgentTutorSystemPromptDefinition,
} from "./langfuse-prompts.js";
import type { AppContext } from "./context.js";

const env = loadEnv({
  DATABASE_URL: "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent",
  DISABLE_AUTH: "true",
}) satisfies AppContext["env"];

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
