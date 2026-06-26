import { and, eq } from "drizzle-orm";
import { notebooks } from "@studyagent/db";
import type { InteractiveLearningActionResponse, InteractiveLearningBlock } from "@studyagent/schemas";
import {
  interactiveLearningActionEnvelopeSchema,
  parseInteractiveLearningActionPayload,
  PASSIVE_INTERACTIVE_ACTIONS,
} from "@studyagent/schemas";
import type { AppContext } from "./context.js";
import { actionAllowedForBlock, findInteractiveBlock, toLearnerFacingInteractiveBlock } from "./interactive-learning-blocks.js";
import { buildReferenceSurface } from "./reference-surface.js";
import { recordInteractiveLearningActionMetric, startMetricTimer } from "@studyagent/observability";
import {
  ACTION_HANDLERS,
  type ActionContext,
  type InteractiveLearningActionError,
} from "./interactive-learning-action-handlers/index.js";

export type { InteractiveLearningActionError } from "./interactive-learning-action-handlers/index.js";

type DispatchInput = {
  ctx: AppContext;
  notebookId: string;
  contentNotebookId?: string;
  userId: string;
  envelope: unknown;
};

type DispatchResult =
  | { ok: true; response: InteractiveLearningActionResponse }
  | { ok: false; error: InteractiveLearningActionError };

type InteractiveLearningMetricOutcome = "success" | "bad_request" | "not_found" | "forbidden" | "error";

function actionNameFromEnvelope(envelope: unknown): string {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return "unknown";
  const actionName = (envelope as Record<string, unknown>).actionName;
  return typeof actionName === "string" && actionName.length > 0 ? actionName : "unknown";
}

async function assertNotebookOwnership(
  ctx: AppContext,
  notebookId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await ctx.db.db
    .select({ id: notebooks.id })
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, userId)))
    .limit(1);
  return Boolean(row);
}

async function rebuildBlockState(
  ctx: AppContext,
  notebookId: string,
  nodeId: string,
  blockId: string,
  userId: string,
): Promise<InteractiveLearningBlock | null> {
  const surface = await buildReferenceSurface(ctx, notebookId, nodeId, { userId });
  const block = findInteractiveBlock(surface.interactiveBlocks ?? [], blockId);
  return block ? toLearnerFacingInteractiveBlock(block) : null;
}

export async function dispatchInteractiveLearningAction(input: DispatchInput): Promise<DispatchResult> {
  const stopTimer = startMetricTimer();
  let metricActionName = actionNameFromEnvelope(input.envelope);
  let metricBlockKind: string | undefined;
  let metricRendererKind: string | undefined;
  const recordMetric = (outcome: InteractiveLearningMetricOutcome, emitsMasteryEvidence = false) => {
    recordInteractiveLearningActionMetric({
      actionName: metricActionName,
      ...(metricBlockKind ? { blockKind: metricBlockKind } : {}),
      ...(metricRendererKind ? { rendererKind: metricRendererKind } : {}),
      outcome,
      emitsMasteryEvidence,
      durationMs: stopTimer(),
    });
  };

  try {
    const parsedEnvelope = interactiveLearningActionEnvelopeSchema.safeParse(input.envelope);
    if (!parsedEnvelope.success) {
      recordMetric("bad_request");
      return {
        ok: false,
        error: { code: "bad_request", message: parsedEnvelope.error.message },
      };
    }

    const envelope = parsedEnvelope.data;
    metricActionName = envelope.actionName;
    metricRendererKind = envelope.rendererKind;
    if (envelope.notebookId !== input.notebookId) {
      recordMetric("forbidden");
      return {
        ok: false,
        error: { code: "forbidden", message: "Action notebook does not match route notebook." },
      };
    }

    const ownsNotebook = await assertNotebookOwnership(input.ctx, input.notebookId, input.userId);
    if (!ownsNotebook) {
      recordMetric("not_found");
      return { ok: false, error: { code: "not_found", message: "Notebook not found." } };
    }

    const nodeId = envelope.nodeRef.refId;
    const readNotebookId = input.contentNotebookId ?? input.notebookId;
    const surface = await buildReferenceSurface(input.ctx, readNotebookId, nodeId, { userId: input.userId });
    const block = findInteractiveBlock(surface.interactiveBlocks ?? [], envelope.blockId);
    if (!block) {
      recordMetric("not_found");
      return { ok: false, error: { code: "not_found", message: "Interactive learning block not found." } };
    }
    metricBlockKind = block.kind;

    if (envelope.surfaceId !== surface.id) {
      recordMetric("bad_request");
      return {
        ok: false,
        error: { code: "bad_request", message: "Action surface does not match the current reference surface." },
      };
    }

    if (!actionAllowedForBlock(block, envelope.actionName)) {
      recordMetric("bad_request");
      return {
        ok: false,
        error: { code: "bad_request", message: `Action ${envelope.actionName} is not allowed for block ${envelope.blockId}.` },
      };
    }

    const parsedPayload = parseInteractiveLearningActionPayload(envelope.actionName, envelope.actionPayload);
    if (!parsedPayload.success) {
      recordMetric("bad_request");
      return { ok: false, error: { code: "bad_request", message: parsedPayload.error } };
    }

    const handler = ACTION_HANDLERS[envelope.actionName];
    if (!handler) {
      recordMetric("bad_request");
      return { ok: false, error: { code: "bad_request", message: `Unsupported action ${envelope.actionName}.` } };
    }

    const actionCtx: ActionContext = {
      ctx: input.ctx,
      notebookId: input.notebookId,
      userId: input.userId,
      envelope,
      block,
      payload: parsedPayload.data,
      nodeId,
      artifactId: envelope.artifactId ?? block.artifactRef?.refId,
    };

    const handlerResult = await handler(actionCtx);
    if (!handlerResult.ok) {
      recordMetric(handlerResult.error.code);
      return handlerResult;
    }

    const emitsMasteryEvidence = !PASSIVE_INTERACTIVE_ACTIONS.has(envelope.actionName);
    const updatedBlock = await rebuildBlockState(input.ctx, readNotebookId, nodeId, envelope.blockId, input.userId);
    if (!updatedBlock) {
      recordMetric("not_found", emitsMasteryEvidence);
      return { ok: false, error: { code: "not_found", message: "Updated block state could not be rebuilt." } };
    }

    recordMetric("success", emitsMasteryEvidence);
    return {
      ok: true,
      response: {
        ok: true,
        actionName: envelope.actionName,
        block: updatedBlock,
        ...(handlerResult.data.updatedConceptStates ? { updatedConceptStates: handlerResult.data.updatedConceptStates } : {}),
        ...(handlerResult.data.attemptId ? { attemptId: handlerResult.data.attemptId } : {}),
        emitsMasteryEvidence,
      },
    };
  } catch (error) {
    recordMetric("error");
    throw error;
  }
}
