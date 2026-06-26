import { and, eq, inArray } from "drizzle-orm";
import { claims, concepts, enqueueGenerationJob, wikiPages } from "@studyagent/db";
import type {
  LearnerFacingReferenceSurface,
  NodeRef,
  PageReadiness,
  ToolContext,
} from "@studyagent/schemas";
import { pageReadinessLabel, type PageGenerationOutput } from "@studyagent/schemas";
import {
  buildHeuristicConceptPageMarkdown,
  buildHeuristicTopicPageMarkdown,
  conceptPageKey,
  resolvePageReadinessFromWikiPage,
  resolveTopicPageKey,
} from "@studyagent/wiki-core";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";
import type { AppContext } from "./context.js";
import { buildEvidenceFromClaimAndChunkIds, loadConceptClaimIds } from "./node-open-target.js";
import { buildReferenceSurface } from "./reference-surface.js";
import {
  compilePageBlockPlansToInteractiveBlocks,
  executeWikiPagePolish,
} from "@studyagent/wiki-generation";

const DEFAULT_FOREGROUND_BUDGET_MS = 30_000;

type WikiPageRow = typeof wikiPages.$inferSelect;

export type WikiTouchStatus = "heuristic" | "polishing" | "polished" | "failed";

export type WikiTouchResult = {
  pageRef: NodeRef;
  readiness: PageReadiness;
  readinessLabel: string;
  status: WikiTouchStatus;
  foregroundCompleted: boolean;
  backgroundContinues: boolean;
  message: string;
  referenceSurface?: LearnerFacingReferenceSurface | undefined;
  qualityIssues?: PageGenerationOutput["qualityIssues"];
};

export type WikiEnsureConceptInput = {
  notebookId: string;
  conceptId: string;
  conceptName?: string;
  createTopicShells?: boolean;
};

export type WikiEnsureTopicInput = {
  notebookId: string;
  topicKey?: string;
  title: string;
};

export type WikiTouchInput = {
  notebookId: string;
  conceptId?: string;
  topicKey?: string;
  title?: string;
  foregroundBudgetMs?: number;
  trigger?: "tutor_touch" | "topic_touch";
  toolCtx?: Pick<ToolContext, "runId" | "sessionId" | "turnId" | "traceId" | "userId">;
};

type TouchRuntime = {
  executePolish?: typeof executeWikiPagePolish;
  sleep?: (ms: number) => Promise<void>;
};

function topicPageKey(topicKeyOrTitle: string): string {
  return topicKeyOrTitle.startsWith("topic:")
    ? topicKeyOrTitle
    : resolveTopicPageKey({ notebookId: "", topicTitle: topicKeyOrTitle });
}

async function emitGenerationEvent(
  ctx: AppContext,
  input: {
    notebookId: string;
    eventType: string;
    payload: Record<string, unknown>;
    toolCtx?: WikiTouchInput["toolCtx"];
    refreshNodeIds?: string[];
  },
): Promise<string> {
  const event = await appendEvent(ctx.db, {
    notebookId: input.notebookId,
    eventType: input.eventType,
    payload: input.payload,
    ...(input.toolCtx?.runId ? { runId: input.toolCtx.runId } : {}),
    ...(input.toolCtx?.sessionId ? { sessionId: input.toolCtx.sessionId } : {}),
  });
  return event.id;
}

async function loadConcept(ctx: AppContext, notebookId: string, conceptId: string) {
  const [concept] = await ctx.db.db
    .select()
    .from(concepts)
    .where(and(eq(concepts.id, conceptId), eq(concepts.notebookId, notebookId)))
    .limit(1);
  return concept ?? null;
}

async function loadWikiPageByKey(
  ctx: AppContext,
  notebookId: string,
  pageKey: string,
  pageType: "concept" | "topic",
) {
  const [page] = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(
      and(
        eq(wikiPages.notebookId, notebookId),
        eq(wikiPages.pageType, pageType),
        eq(wikiPages.pageKey, pageKey),
      ),
    )
    .limit(1);
  return page ?? null;
}

async function loadConceptClaims(ctx: AppContext, conceptId: string) {
  const claimIds = await loadConceptClaimIds(ctx, conceptId);
  if (!claimIds.length) return [];
  const rows = await ctx.db.db
    .select({
      id: claims.id,
      claimText: claims.claimText,
      confidence: claims.confidence,
      status: claims.status,
    })
    .from(claims)
    .where(inArray(claims.id, claimIds))
    .limit(20);
  return rows
    .filter((row) => row.status !== "contradicted" && row.status !== "superseded")
    .map((row) => ({ id: row.id, text: row.claimText, confidence: row.confidence ?? 0.5 }));
}

async function createHeuristicConceptPage(
  ctx: AppContext,
  input: {
    notebookId: string;
    conceptId: string;
    title: string;
    toolCtx?: WikiTouchInput["toolCtx"];
  },
): Promise<WikiPageRow> {
  const relatedClaims = await loadConceptClaims(ctx, input.conceptId);
  const heuristic = buildHeuristicConceptPageMarkdown({
    conceptName: input.title,
    claims: relatedClaims.map((claim) => ({ text: claim.text, confidence: claim.confidence })),
  });
  const markdown = heuristic.markdown;
  const now = new Date();
  const pageId = `wp_${crypto.randomUUID().replaceAll("-", "")}`;
  const sourceClaimIds = relatedClaims.map((claim) => claim.id);
  const readiness = heuristic.readiness;

  await ctx.db.db.insert(wikiPages).values({
    id: pageId,
    notebookId: input.notebookId,
    pageType: "concept",
    pageKey: conceptPageKey(input.conceptId),
    title: `Concept · ${input.title}`,
    version: 1,
    status: "draft",
    structuredJson: {
      conceptId: input.conceptId,
      pageReadiness: readiness,
      generationMode: heuristic.generationMode,
      lastGeneratedAt: now.toISOString(),
      ...heuristic.structuredJson,
    },
    markdown,
    sourceClaimIds,
    sourceChunkIds: [],
    qualityScore: 0.45,
    createdAt: now,
    updatedAt: now,
  });

  await emitGenerationEvent(ctx, {
    notebookId: input.notebookId,
    eventType: "generation.page.heuristic.created",
    toolCtx: input.toolCtx,
    refreshNodeIds: [pageId, input.conceptId],
    payload: {
      pageId,
      pageKey: conceptPageKey(input.conceptId),
      pageType: "concept",
      conceptId: input.conceptId,
      readiness,
      safeMessage: "Created a heuristic concept page.",
    },
  });

  const [page] = await ctx.db.db.select().from(wikiPages).where(eq(wikiPages.id, pageId)).limit(1);
  return page!;
}

async function createHeuristicTopicPage(
  ctx: AppContext,
  input: {
    notebookId: string;
    pageKey: string;
    title: string;
    toolCtx?: WikiTouchInput["toolCtx"];
  },
): Promise<WikiPageRow> {
  const now = new Date();
  const pageId = `wp_${crypto.randomUUID().replaceAll("-", "")}`;
  const heuristic = buildHeuristicTopicPageMarkdown({
    topicTitle: input.title,
    concepts: [],
  });
  const readiness = heuristic.readiness;
  const markdown = heuristic.markdown;

  await ctx.db.db.insert(wikiPages).values({
    id: pageId,
    notebookId: input.notebookId,
    pageType: "topic",
    pageKey: input.pageKey,
    title: `Topic · ${input.title}`,
    version: 1,
    status: "draft",
    structuredJson: {
      topicKey: input.pageKey,
      topicTitle: input.title,
      pageReadiness: readiness,
      generationMode: heuristic.generationMode,
      lastGeneratedAt: now.toISOString(),
      ...heuristic.structuredJson,
    },
    markdown,
    sourceClaimIds: [],
    sourceChunkIds: [],
    qualityScore: 0.4,
    createdAt: now,
    updatedAt: now,
  });

  await emitGenerationEvent(ctx, {
    notebookId: input.notebookId,
    eventType: "generation.page.heuristic.created",
    toolCtx: input.toolCtx,
    refreshNodeIds: [pageId],
    payload: {
      pageId,
      pageKey: input.pageKey,
      pageType: "topic",
      readiness,
      safeMessage: "Created a heuristic topic page.",
    },
  });

  const [page] = await ctx.db.db.select().from(wikiPages).where(eq(wikiPages.id, pageId)).limit(1);
  return page!;
}

async function buildTouchReferenceSurface(
  ctx: AppContext,
  page: WikiPageRow,
  polished: PageGenerationOutput | null,
  userId?: string,
): Promise<LearnerFacingReferenceSurface | undefined> {
  try {
    const base = await buildReferenceSurface(
      ctx,
      page.notebookId,
      page.id,
      userId ? { userId } : {},
    );
    if (!polished) return base;
    const interactiveBlocks = compilePageBlockPlansToInteractiveBlocks(polished.blocks, {
      nodeRef: { refType: "wiki_page", refId: page.id },
      surfaceType: "wiki_page",
    });
    if (!interactiveBlocks.length) return base;
    return {
      ...base,
      interactiveBlocks,
    };
  } catch {
    return undefined;
  }
}

function shouldPolish(page: WikiPageRow): boolean {
  const readiness = resolvePageReadinessFromWikiPage(page);
  return readiness !== "ready_to_study" || (page.qualityScore ?? 0) < 0.7;
}

async function reloadWikiPage(
  ctx: AppContext,
  notebookId: string,
  pageId: string,
): Promise<WikiPageRow | null> {
  const [page] = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.id, pageId), eq(wikiPages.notebookId, notebookId)))
    .limit(1);
  return page ?? null;
}

async function runTouchPolish(
  ctx: AppContext,
  input: {
    notebookId: string;
    page: WikiPageRow;
    pageType: "concept" | "topic";
    title: string;
    conceptId?: string;
    foregroundBudgetMs: number;
    trigger: "tutor_touch" | "topic_touch";
    toolCtx?: WikiTouchInput["toolCtx"];
  },
  runtime: TouchRuntime = {},
): Promise<WikiTouchResult> {
  await emitGenerationEvent(ctx, {
    notebookId: input.notebookId,
    eventType: "generation.touch.started",
    toolCtx: input.toolCtx,
    payload: {
      pageId: input.page.id,
      pageKey: input.page.pageKey,
      pageType: input.pageType,
      trigger: input.trigger,
      foregroundBudgetMs: input.foregroundBudgetMs,
    },
  });

  await emitGenerationEvent(ctx, {
    notebookId: input.notebookId,
    eventType: "generation.page.polish.started",
    toolCtx: input.toolCtx,
    payload: {
      pageId: input.page.id,
      pageKey: input.page.pageKey,
      pageType: input.pageType,
      generationMode: "tutor_touch",
    },
  });

  const executePolish = runtime.executePolish ?? executeWikiPagePolish;
  const polishPromise = executePolish(ctx.env, ctx.db, {
    notebookId: input.notebookId,
    pageId: input.page.id,
    pageKey: input.page.pageKey,
    pageType: input.pageType,
    title: input.title,
    generationMode: "tutor_touch",
    trigger: input.trigger,
    idempotencyKey: `touch_fg:${input.page.id}:${input.page.pageKey}`,
    ...(input.conceptId ? { conceptId: input.conceptId } : {}),
  });
  const sleep =
    runtime.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutPromise = sleep(input.foregroundBudgetMs).then(() => "timeout" as const);
  const raced = await Promise.race([
    polishPromise.then((value) => ({ kind: "done" as const, value })),
    timeoutPromise.then((kind) => ({ kind })),
  ]);

  if (raced.kind === "done" && raced.value.ok && raced.value.applied) {
    const updated = (await reloadWikiPage(ctx, input.notebookId, input.page.id)) ?? input.page;
    await emitGenerationEvent(ctx, {
      notebookId: input.notebookId,
      eventType: "generation.touch.completed",
      toolCtx: input.toolCtx,
      payload: {
        pageId: updated.id,
        foregroundCompleted: true,
        backgroundContinues: false,
        readiness: resolvePageReadinessFromWikiPage(updated),
        safeMessage: "Updated the page during this touch.",
      },
    });
    const base = await resultFromPage(updated, {
      status: "polished",
      foregroundCompleted: true,
      backgroundContinues: false,
      message: "The page was improved during this touch.",
      qualityIssues: raced.value.qualityIssues,
    });
    return {
      ...base,
      referenceSurface: await buildTouchReferenceSurface(ctx, updated, null, input.toolCtx?.userId),
    };
  }

  if (raced.kind === "done" && (!raced.value.ok || !raced.value.applied)) {
    await emitGenerationEvent(ctx, {
      notebookId: input.notebookId,
      eventType: "generation.page.polish.failed",
      toolCtx: input.toolCtx,
      payload: {
        pageId: input.page.id,
        qualityIssues: raced.value.qualityIssues,
        safeMessage: "Kept the current page because polish did not pass quality gates.",
      },
    });
    await emitGenerationEvent(ctx, {
      notebookId: input.notebookId,
      eventType: "generation.touch.failed",
      toolCtx: input.toolCtx,
      payload: {
        pageId: input.page.id,
        foregroundCompleted: true,
        backgroundContinues: false,
        safeMessage: "Page polish failed quality checks; the current page is still available.",
      },
    });
    const base = await resultFromPage(input.page, {
      status: "failed",
      foregroundCompleted: true,
      backgroundContinues: false,
      message: "Polish did not pass quality checks. The current page is still available.",
      qualityIssues: raced.value.qualityIssues,
    });
    return {
      ...base,
      referenceSurface: await buildTouchReferenceSurface(
        ctx,
        input.page,
        null,
        input.toolCtx?.userId,
      ),
    };
  }

  const pendingStructuredJson = {
    ...(input.page.structuredJson ?? {}),
    backgroundPolishStatus: "pending",
    backgroundPolishStartedAt: new Date().toISOString(),
    backgroundPolishRequest: {
      pageType: input.pageType,
      title: input.title,
      ...(input.conceptId ? { conceptId: input.conceptId } : {}),
      trigger: input.trigger,
    },
  };
  await ctx.db.db
    .update(wikiPages)
    .set({ structuredJson: pendingStructuredJson, updatedAt: new Date() })
    .where(and(eq(wikiPages.id, input.page.id), eq(wikiPages.notebookId, input.notebookId)));
  input.page = { ...input.page, structuredJson: pendingStructuredJson };

  // The executor checks backgroundPolishStatus before persisting, so a late
  // foreground result cannot race the durable background continuation.
  void polishPromise.catch(() => undefined);

  await emitGenerationEvent(ctx, {
    notebookId: input.notebookId,
    eventType: "generation.touch.foreground_timeout",
    toolCtx: input.toolCtx,
    payload: {
      pageId: input.page.id,
      foregroundBudgetMs: input.foregroundBudgetMs,
      safeMessage: "Page improvement continues in the background.",
    },
  });

  let backgroundEnqueued = false;
  try {
    await enqueueGenerationJob(ctx.db, {
      jobName: "wiki_touch_background",
      notebookId: input.notebookId,
      idempotencyKey: `touch_bg:${input.page.id}:${input.page.pageKey}`,
      targetType: input.pageType === "concept" ? "concept_page" : "topic_page",
      generationMode: "tutor_touch",
      trigger: "wiki_polish_enqueue",
      payloadJson: {
        pageId: input.page.id,
        pageKey: input.page.pageKey,
        pageType: input.pageType,
        ...(input.conceptId ? { conceptId: input.conceptId } : {}),
      },
    });
    backgroundEnqueued = true;
  } catch (error) {
    await emitGenerationEvent(ctx, {
      notebookId: input.notebookId,
      eventType: "generation.touch.failed",
      toolCtx: input.toolCtx,
      payload: {
        pageId: input.page.id,
        pageKey: input.page.pageKey,
        foregroundCompleted: false,
        backgroundContinues: true,
        reason: error instanceof Error ? error.message : String(error),
        safeMessage: "Background page polish enqueue failed; pending polish remains recoverable.",
      },
    });
  }

  if (backgroundEnqueued) {
    await emitGenerationEvent(ctx, {
      notebookId: input.notebookId,
      eventType: "generation.touch.background_enqueued",
      toolCtx: input.toolCtx,
      payload: {
        pageId: input.page.id,
        pageKey: input.page.pageKey,
        safeMessage: "Background page polish enqueued for durable completion.",
      },
    });
  }

  const base = await resultFromPage(input.page, {
    status: "polishing",
    foregroundCompleted: false,
    backgroundContinues: true,
    message: "Page improvement continues in the background. The current page is ready to study.",
  });
  return {
    ...base,
    referenceSurface: await buildTouchReferenceSurface(
      ctx,
      input.page,
      null,
      input.toolCtx?.userId,
    ),
  };
}

async function resultFromPage(
  page: WikiPageRow,
  input: {
    status: WikiTouchStatus;
    foregroundCompleted: boolean;
    backgroundContinues: boolean;
    message: string;
    polished?: PageGenerationOutput | null;
    qualityIssues?: PageGenerationOutput["qualityIssues"];
  },
): Promise<WikiTouchResult> {
  const readiness = resolvePageReadinessFromWikiPage(page);
  return {
    pageRef: { refType: "wiki_page", refId: page.id },
    readiness,
    readinessLabel: pageReadinessLabel(readiness),
    status: input.status,
    foregroundCompleted: input.foregroundCompleted,
    backgroundContinues: input.backgroundContinues,
    message: input.message,
    ...(input.qualityIssues ? { qualityIssues: input.qualityIssues } : {}),
  };
}

export async function ensureConceptPage(
  ctx: AppContext,
  input: WikiEnsureConceptInput & { toolCtx?: WikiTouchInput["toolCtx"] },
): Promise<WikiTouchResult> {
  if (input.createTopicShells) {
    throw new Error("Concept touch cannot create topic page shells.");
  }
  const concept = await loadConcept(ctx, input.notebookId, input.conceptId);
  if (!concept && !input.conceptName?.trim()) {
    throw new Error(`Concept ${input.conceptId} was not found in notebook ${input.notebookId}.`);
  }

  const pageKey = conceptPageKey(input.conceptId);
  let page = await loadWikiPageByKey(ctx, input.notebookId, pageKey, "concept");
  if (!page) {
    page = await createHeuristicConceptPage(ctx, {
      notebookId: input.notebookId,
      conceptId: input.conceptId,
      title: input.conceptName?.trim() || concept!.canonicalName,
      toolCtx: input.toolCtx,
    });
  }

  const readiness = resolvePageReadinessFromWikiPage(page);
  return {
    pageRef: { refType: "wiki_page", refId: page.id },
    readiness,
    readinessLabel: pageReadinessLabel(readiness),
    status: "heuristic",
    foregroundCompleted: true,
    backgroundContinues: false,
    message: "Concept page is available.",
  };
}

export async function ensureTopicPage(
  ctx: AppContext,
  input: WikiEnsureTopicInput & { toolCtx?: WikiTouchInput["toolCtx"] },
): Promise<WikiTouchResult> {
  const pageKey = input.topicKey ? topicPageKey(input.topicKey) : topicPageKey(input.title);
  let page = await loadWikiPageByKey(ctx, input.notebookId, pageKey, "topic");
  if (!page) {
    page = await createHeuristicTopicPage(ctx, {
      notebookId: input.notebookId,
      pageKey,
      title: input.title,
      toolCtx: input.toolCtx,
    });
  }

  const readiness = resolvePageReadinessFromWikiPage(page);
  return {
    pageRef: { refType: "wiki_page", refId: page.id },
    readiness,
    readinessLabel: pageReadinessLabel(readiness),
    status: "heuristic",
    foregroundCompleted: true,
    backgroundContinues: false,
    message: "Topic page is available.",
  };
}

export async function touchConceptPage(
  ctx: AppContext,
  input: WikiTouchInput,
  runtime: TouchRuntime = {},
): Promise<WikiTouchResult> {
  if (!input.conceptId) throw new Error("conceptId is required for concept touch.");
  const ensured = await ensureConceptPage(ctx, {
    notebookId: input.notebookId,
    conceptId: input.conceptId,
    ...(input.title ? { conceptName: input.title } : {}),
    createTopicShells: false,
    toolCtx: input.toolCtx,
  });
  const [page] = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(eq(wikiPages.id, ensured.pageRef.refId))
    .limit(1);
  if (!page || !shouldPolish(page)) {
    return {
      ...ensured,
      referenceSurface: await buildTouchReferenceSurface(
        ctx,
        page ?? ({} as WikiPageRow),
        null,
        input.toolCtx?.userId,
      ),
    };
  }
  const concept = await loadConcept(ctx, input.notebookId, input.conceptId);
  return runTouchPolish(
    ctx,
    {
      notebookId: input.notebookId,
      page,
      pageType: "concept",
      title: input.title ?? concept?.canonicalName ?? "Concept",
      conceptId: input.conceptId,
      foregroundBudgetMs: input.foregroundBudgetMs ?? DEFAULT_FOREGROUND_BUDGET_MS,
      trigger: input.trigger ?? "tutor_touch",
      toolCtx: input.toolCtx,
    },
    runtime,
  );
}

export async function touchTopicPage(
  ctx: AppContext,
  input: WikiTouchInput,
  runtime: TouchRuntime = {},
): Promise<WikiTouchResult> {
  if (!input.title && !input.topicKey)
    throw new Error("title or topicKey is required for topic touch.");
  const ensured = await ensureTopicPage(ctx, {
    notebookId: input.notebookId,
    title: input.title ?? input.topicKey ?? "Topic",
    ...(input.topicKey ? { topicKey: input.topicKey } : {}),
    toolCtx: input.toolCtx,
  });
  const [page] = await ctx.db.db
    .select()
    .from(wikiPages)
    .where(eq(wikiPages.id, ensured.pageRef.refId))
    .limit(1);
  if (!page || !shouldPolish(page)) {
    return {
      ...ensured,
      referenceSurface: page
        ? await buildTouchReferenceSurface(ctx, page, null, input.toolCtx?.userId)
        : undefined,
    };
  }
  return runTouchPolish(
    ctx,
    {
      notebookId: input.notebookId,
      page,
      pageType: "topic",
      title: input.title ?? page.title.replace(/^Topic ·\s*/, ""),
      foregroundBudgetMs: input.foregroundBudgetMs ?? DEFAULT_FOREGROUND_BUDGET_MS,
      trigger: input.trigger ?? "topic_touch",
      toolCtx: input.toolCtx,
    },
    runtime,
  );
}
