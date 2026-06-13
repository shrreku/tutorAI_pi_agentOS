import {
  buildGenerationIdempotencyKey,
  type GenerationTarget,
  type InteractiveLearningBlock,
  type InteractiveLearningBlockPlan,
  type NodeRef,
  type ReferenceSurface,
} from "@studyagent/schemas";
import { compileInteractiveBlockPlan } from "./interactive-block-compiler.js";

export function buildIdempotencyKey(
  target: Pick<GenerationTarget, "notebookId" | "targetType" | "pageKey" | "targetRef" | "generationMode">,
): string {
  return buildGenerationIdempotencyKey({
    notebookId: target.notebookId,
    targetType: target.targetType,
    targetRef:
      target.pageKey ??
      (target.targetRef ? `${target.targetRef.refType}:${target.targetRef.refId}` : "none"),
    generationMode: target.generationMode,
    trigger: "wiki_polish_enqueue",
  });
}

export type CompileBlockPlanResult =
  | { ok: true; block: InteractiveLearningBlock }
  | { ok: false; error: string };

export function compileBlockPlanToInteractiveBlock(
  plan: InteractiveLearningBlockPlan,
  options: {
    blockId: string;
    nodeRef?: InteractiveLearningBlock["nodeRef"];
    surfaceType?: ReferenceSurface["surfaceType"];
  },
): CompileBlockPlanResult {
  const nodeRef: NodeRef = options.nodeRef ?? { refType: "wiki_page", refId: options.blockId };
  const block = compileInteractiveBlockPlan(plan, {
    nodeRef,
    surfaceType: options.surfaceType ?? "wiki_page",
    blockIndex: 0,
  });
  if (!block) {
    return { ok: false, error: "Failed to compile interactive learning block plan." };
  }
  if (block.id !== options.blockId) {
    return { ok: true, block: { ...block, id: options.blockId } };
  }
  return { ok: true, block };
}
