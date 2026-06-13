import { recordGenerationLifecycleMetric } from "@studyagent/observability";
import type { GenerationMode, GenerationTrigger } from "@studyagent/schemas";

export function recordGenerationMetric(input: {
  eventType: string;
  outcome: "success" | "timeout" | "failure" | "skipped";
  generationMode?: GenerationMode | string;
  trigger?: GenerationTrigger | string;
}): void {
  recordGenerationLifecycleMetric({
    eventType: input.eventType,
    outcome: input.outcome,
    ...(input.generationMode ? { generationMode: input.generationMode } : {}),
    ...(input.trigger ? { trigger: input.trigger } : {}),
  });
}
