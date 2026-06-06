import { loadEnv } from "@studyagent/config";
import { syncStudyAgentLangfusePrompts } from "../langfuse-prompts.js";

const env = loadEnv();
const synced = await syncStudyAgentLangfusePrompts(env);

for (const prompt of synced) {
  console.log(
    `synced ${prompt.name} version=${prompt.version ?? "unknown"} label=${prompt.label ?? "none"} source=${prompt.source}`,
  );
}
