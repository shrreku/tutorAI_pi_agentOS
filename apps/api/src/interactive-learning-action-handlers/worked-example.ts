import type {
  workedExampleStepAnsweredPayloadSchema,
  workedExampleStepRevealedPayloadSchema,
} from "@studyagent/schemas";
import type { z } from "zod";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "../agentic-cache-invalidation.js";
import type { ActionContext, ActionHandlerOutcome } from "./types.js";
import { persistWorkedExampleStepAnswer } from "./shared.js";

export async function handleWorkedExampleStepAnswered(
  actionCtx: ActionContext,
): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, envelope, payload, artifactId } = actionCtx;
  if (!artifactId) {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Worked example actions require an artifact reference.",
      },
    };
  }

  const stepPayload = payload as z.infer<typeof workedExampleStepAnsweredPayloadSchema>;
  await persistWorkedExampleStepAnswer(ctx, {
    notebookId,
    artifactId,
    stepId: stepPayload.stepId,
    answer: stepPayload.answer,
    ...(stepPayload.isCorrect !== undefined ? { isCorrect: stepPayload.isCorrect } : {}),
    revealed: false,
  });
  await appendEvent(ctx.db, {
    notebookId,
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    ...(envelope.runId ? { runId: envelope.runId } : {}),
    eventType: "artifact.updated",
    payload: {
      artifactId,
      artifactType: "worked_example",
    },
  });

  return { ok: true, data: {} };
}

export async function handleWorkedExampleStepRevealed(
  actionCtx: ActionContext,
): Promise<ActionHandlerOutcome> {
  const { ctx, notebookId, envelope, payload, artifactId } = actionCtx;
  if (!artifactId) {
    return {
      ok: false,
      error: {
        code: "bad_request",
        message: "Worked example actions require an artifact reference.",
      },
    };
  }

  const stepPayload = payload as z.infer<typeof workedExampleStepRevealedPayloadSchema>;
  await persistWorkedExampleStepAnswer(ctx, {
    notebookId,
    artifactId,
    stepId: stepPayload.stepId,
    answer: "(hint revealed)",
    revealed: true,
  });
  await appendEvent(ctx.db, {
    notebookId,
    ...(envelope.sessionId ? { sessionId: envelope.sessionId } : {}),
    ...(envelope.runId ? { runId: envelope.runId } : {}),
    eventType: "artifact.updated",
    payload: {
      artifactId,
      artifactType: "worked_example",
    },
  });

  return { ok: true, data: {} };
}
