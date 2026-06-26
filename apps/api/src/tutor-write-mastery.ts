import {
  buildReducerResult,
  normalizeConceptRole,
  normalizeMasteryEvidenceType,
  normalizeMasteryTriggerSource,
  ToolError,
  type EvaluateLearnerResponseOutput,
  type RuntimeWriteToolProvider,
} from "@studyagent/tools";
import type { AppContext } from "./context.js";
import { createOpenRouterMasteryEvaluatorJudge } from "./mastery-llm-judge.js";
import { evaluatePersistAndApply } from "./mastery-pipeline.js";

export function createMasteryWriteHandlers(
  appCtx: AppContext,
): Pick<RuntimeWriteToolProvider, "evaluateLearnerResponse"> {
  const judge = createOpenRouterMasteryEvaluatorJudge(appCtx.env);
  return {
    async evaluateLearnerResponse(input, ctx): Promise<EvaluateLearnerResponseOutput> {
      let result;
      try {
        result = await evaluatePersistAndApply(appCtx.db, {
          notebookId: ctx.notebookId,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          turnId: ctx.turnId,
          runId: ctx.runId,
          tutorQuestion: input.tutorQuestion,
          learnerAnswer: input.learnerAnswer,
          objectiveId: input.objectiveId,
          conceptRoles: input.conceptRoles.map((role) => ({
            conceptId: role.conceptId,
            role: normalizeConceptRole(role.role),
          })),
          masterySnapshot: input.masterySnapshot ?? {},
          sourceRefs: input.sourceRefs,
          contextRefs: input.contextRefs,
          referenceAnswer: input.referenceAnswer,
          evidenceType: normalizeMasteryEvidenceType(input.evidenceType),
          triggerSource: normalizeMasteryTriggerSource(input.triggerSource),
        }, judge ? { judge, analyticsContext: appCtx } : { analyticsContext: appCtx });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ToolError("mastery_evaluation_failed", `Mastery evaluation failed: ${message}`);
      }

      return {
        masteryEvidenceId: result.evidenceId,
        correctnessLabel: result.evidence.correctnessLabel,
        tutoringIntervention: result.evidence.tutoringIntervention,
        readiness: result.evidence.readiness,
        overallScore: result.evidence.overallScore,
        confidence: result.evidence.confidence,
        uncertainty: result.evidence.uncertainty,
        conceptIds: result.evidence.conceptScores.map((entry) => entry.conceptId),
        warnings: [],
        reducerResult: buildReducerResult(
          "learning.mastery.updated",
          {
            masteryEvidenceId: result.evidenceId,
            notebookId: ctx.notebookId,
            conceptIds: result.evidence.conceptScores.map((entry) => entry.conceptId),
            correctnessLabel: result.evidence.correctnessLabel,
            tutoringIntervention: result.evidence.tutoringIntervention,
            updatedConceptStates: result.updatedConceptStates,
          },
          [result.eventId],
        ),
      };
    },
  };
}
