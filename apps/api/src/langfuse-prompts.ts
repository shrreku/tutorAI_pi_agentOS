import {
  buildStudyAgentSystemPrompt,
  buildStudyAgentSystemPromptVariables,
  STUDYAGENT_TUTOR_SYSTEM_PROMPT_NAME,
  STUDYAGENT_TUTOR_SYSTEM_PROMPT_TEMPLATE_V1,
  type StudyAgentPromptContext,
} from "@studyagent/agent-runtime";
import { resolveManagedTextPrompt, syncManagedTextPrompts, type ResolvedManagedTextPrompt } from "@studyagent/observability";
import type { AppContext } from "./context.js";

export function studyAgentTutorSystemPromptDefinition(env: AppContext["env"]) {
  return {
    name: env.LANGFUSE_TUTOR_PROMPT_NAME || STUDYAGENT_TUTOR_SYSTEM_PROMPT_NAME,
    prompt: STUDYAGENT_TUTOR_SYSTEM_PROMPT_TEMPLATE_V1,
    labels: [env.LANGFUSE_PROMPT_LABEL || "production"],
    tags: ["studyagent", "tutor", "system"],
    config: {
      promptTemplateVersion: "v1",
      variables: ["notebookContext", "additionalInstructions"],
      owner: "api-runtime",
    },
    commitMessage: "StudyAgent tutor system prompt v1",
  };
}

export async function resolveStudyAgentTutorSystemPrompt(
  env: AppContext["env"],
  promptContext: StudyAgentPromptContext,
): Promise<ResolvedManagedTextPrompt> {
  const localPrompt = buildStudyAgentSystemPrompt(promptContext);
  return await resolveManagedTextPrompt({
    env,
    name: env.LANGFUSE_TUTOR_PROMPT_NAME || STUDYAGENT_TUTOR_SYSTEM_PROMPT_NAME,
    label: env.LANGFUSE_PROMPT_LABEL,
    cacheTtlSeconds: env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS,
    fetchTimeoutMs: env.LANGFUSE_PROMPT_FETCH_TIMEOUT_MS,
    fallback: localPrompt,
    variables: buildStudyAgentSystemPromptVariables(promptContext),
  });
}

export async function syncStudyAgentLangfusePrompts(env: AppContext["env"]) {
  return await syncManagedTextPrompts({
    env,
    prompts: [studyAgentTutorSystemPromptDefinition(env)],
    defaultLabel: env.LANGFUSE_PROMPT_LABEL,
  });
}
