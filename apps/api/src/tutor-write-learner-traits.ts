import { buildReducerResult, type LearnerTraitRecordSignalOutput, type RuntimeWriteToolProvider } from "@studyagent/tools";
import type { AppContext } from "./context.js";
import { recordLearnerTraitSignal as recordLearnerTraitSignalStore } from "./learner-trait-store.js";

export function createLearnerTraitWriteHandlers(
  appCtx: AppContext,
): Pick<RuntimeWriteToolProvider, "recordLearnerTraitSignal"> {
  return {
    async recordLearnerTraitSignal(input, ctx): Promise<LearnerTraitRecordSignalOutput> {
      const evidenceRefs = input.evidenceRefs.length
        ? input.evidenceRefs
        : [{ refType: "session_trace" as const, refId: ctx.sessionId ?? ctx.runId ?? ctx.notebookId }];
      const signalInput = {
        id: `lts_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: ctx.notebookId,
        userId: input.userId ?? ctx.userId,
        source: input.source,
        trait: input.trait,
        suggestedValue: input.value,
        strength: input.strength,
        confidence: input.confidence,
        evidenceRefs,
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        ...(ctx.turnId ? { turnId: ctx.turnId } : {}),
        ...(ctx.runId ? { runId: ctx.runId } : {}),
        observedAt: new Date().toISOString(),
        internalVisibility: true,
        ...(input.notes ? { notes: input.notes } : {}),
      };
      const result = await recordLearnerTraitSignalStore(appCtx.db, signalInput as Parameters<typeof recordLearnerTraitSignalStore>[1]);

      return {
        signal: result.signal,
        warnings: [],
        reducerResult: buildReducerResult(
          "learner_trait.signal.recorded",
          {
            signalId: result.signal.id,
            notebookId: ctx.notebookId,
            userId: input.userId ?? ctx.userId,
            trait: input.trait,
            source: input.source,
            evidenceRefs,
          },
          [result.eventId],
        ),
      };
    },
  };
}
