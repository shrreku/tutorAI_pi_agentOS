import type { StudyAgentEnv } from "@studyagent/config";
import type { MasteryEvidenceInput } from "@studyagent/schemas";
import type { MasteryEvaluatorJudge, MasteryEvaluatorJudgeResult } from "./mastery-evaluator.js";
import { fetchOpenRouterJsonCompletion } from "@studyagent/llm-client";

type JudgeInput = MasteryEvidenceInput & { notebookId: string; userId: string };

export function createOpenRouterMasteryEvaluatorJudge(
  env: StudyAgentEnv | undefined,
): MasteryEvaluatorJudge | undefined {
  if (!env?.OPENROUTER_API_KEY) return undefined;
  const model = env.DEFAULT_EXTRACTION_MODEL ?? env.DEFAULT_TUTOR_MODEL ?? "openrouter/auto";

  return async (input: JudgeInput): Promise<MasteryEvaluatorJudgeResult> => {
    return fetchOpenRouterJsonCompletion(
      {
        apiKey: env.OPENROUTER_API_KEY!,
        baseUrl: env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
        model,
        temperature: 0.1,
        timeoutMs: 6_000,
        label: "Mastery evaluator",
      },
      [
        {
          role: "system",
          content: [
            "You are StudyAgent's mastery evaluator.",
            "Judge whether the learner answer addresses the tutor question.",
            "Grade semantic correctness; do not require lexical overlap or verbatim phrasing with the reference answer.",
            "Short checkpoint answers like agree/disagree/yes/no can be correct even when they do not match a long reference explanation verbatim.",
            "Return strict JSON with keys:",
            "correctnessLabel (correct|partial|incorrect|needs_more_evidence),",
            "overallScore (0-1), confidence (0-1), uncertainty (0-1),",
            "misconceptions (array of {conceptId, description}),",
            "tutoringIntervention (clarify|reteach|worked_example|guided_practice|quick_check|advance),",
            "notes (string).",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            tutorQuestion: input.tutorQuestion,
            learnerAnswer: input.learnerAnswer,
            referenceAnswer: input.referenceAnswer ?? null,
            conceptRoles: input.conceptRoles,
            evidenceType: input.evidenceType ?? "mastery_check",
          }),
        },
      ],
    ) as Promise<MasteryEvaluatorJudgeResult>;
  };
}
