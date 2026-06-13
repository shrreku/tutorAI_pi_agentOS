import type { ToolContext } from "@studyagent/schemas";
import {
  buildReducerResult,
  type EnsureConceptPageInput,
  type EnsureConceptPageOutput,
  type EnsureTopicPageInput,
  type EnsureTopicPageOutput,
  type RuntimeWriteToolProvider,
  type TouchConceptPageInput,
  type TouchConceptPageOutput,
  type TouchTopicPageInput,
  type TouchTopicPageOutput,
} from "@studyagent/tools";
import type { AppContext } from "./context.js";
import {
  ensureConceptPage,
  ensureTopicPage,
  touchConceptPage,
  touchTopicPage,
} from "./wiki-touch-service.js";

function packageWikiTouchOutput(
  touch: Awaited<ReturnType<typeof touchConceptPage>>,
  reducerResult: ReturnType<typeof buildReducerResult>,
) {
  return {
    pageRef: touch.pageRef,
    readiness: touch.readiness,
    readinessLabel: touch.readinessLabel,
    status: touch.status,
    foregroundCompleted: touch.foregroundCompleted,
    backgroundContinues: touch.backgroundContinues,
    message: touch.message,
    ...(touch.referenceSurface ? { referenceSurface: touch.referenceSurface } : {}),
    ...(touch.qualityIssues ? { qualityIssues: touch.qualityIssues } : {}),
    warnings: [],
    reducerResult,
  };
}

function touchReducerPayload(
  ctx: ToolContext,
  touch: Awaited<ReturnType<typeof touchConceptPage>>,
  mutationType: string,
) {
  return buildReducerResult(mutationType, {
    notebookId: ctx.notebookId,
    pageRef: touch.pageRef,
    readiness: touch.readiness,
    readinessLabel: touch.readinessLabel,
    status: touch.status,
    foregroundCompleted: touch.foregroundCompleted,
    backgroundContinues: touch.backgroundContinues,
    message: touch.message,
    traceId: ctx.traceId,
  });
}

export function createWikiWriteHandlers(
  appCtx: AppContext,
): Pick<
  RuntimeWriteToolProvider,
  "ensureConceptPage" | "ensureTopicPage" | "touchConceptPage" | "touchTopicPage"
> {
  return {
    async ensureConceptPage(input: EnsureConceptPageInput, ctx): Promise<EnsureConceptPageOutput> {
      const touch = await ensureConceptPage(appCtx, {
        notebookId: ctx.notebookId,
        conceptId: input.conceptId,
        ...(input.conceptName ? { conceptName: input.conceptName } : {}),
        createTopicShells: false,
        toolCtx: ctx,
      });
      return packageWikiTouchOutput(touch, touchReducerPayload(ctx, touch, "wiki.page.ensured"));
    },

    async ensureTopicPage(input: EnsureTopicPageInput, ctx): Promise<EnsureTopicPageOutput> {
      const touch = await ensureTopicPage(appCtx, {
        notebookId: ctx.notebookId,
        title: input.title,
        ...(input.topicKey ? { topicKey: input.topicKey } : {}),
        toolCtx: ctx,
      });
      return packageWikiTouchOutput(touch, touchReducerPayload(ctx, touch, "wiki.page.ensured"));
    },

    async touchConceptPage(input: TouchConceptPageInput, ctx): Promise<TouchConceptPageOutput> {
      const touch = await touchConceptPage(appCtx, {
        notebookId: ctx.notebookId,
        conceptId: input.conceptId,
        ...(input.conceptName ? { title: input.conceptName } : {}),
        foregroundBudgetMs: input.foregroundBudgetMs,
        trigger: "tutor_touch",
        toolCtx: ctx,
      });
      return packageWikiTouchOutput(touch, touchReducerPayload(ctx, touch, "generation.touch.completed"));
    },

    async touchTopicPage(input: TouchTopicPageInput, ctx): Promise<TouchTopicPageOutput> {
      const touch = await touchTopicPage(appCtx, {
        notebookId: ctx.notebookId,
        ...(input.topicKey ? { topicKey: input.topicKey } : {}),
        ...(input.title ? { title: input.title } : {}),
        foregroundBudgetMs: input.foregroundBudgetMs,
        trigger: "topic_touch",
        toolCtx: ctx,
      });
      return packageWikiTouchOutput(touch, touchReducerPayload(ctx, touch, "generation.touch.completed"));
    },
  };
}
