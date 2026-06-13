import type { StudyAgentEnv } from "@studyagent/config";
import type { DbClient } from "@studyagent/db";
import { appendEvent, claims, wikiPages } from "@studyagent/db";
import {
  buildGenerationIdempotencyKey,
  learnerLabelForPageReadiness,
  pagePolishOutputSchema,
  type GenerationMode,
  type GenerationTarget,
  type PagePolishOutput,
  type PageQualityIssue,
  type PageReadiness,
} from "@studyagent/schemas";
import { extractHumanBlocks, mergeAgentMarkdownWithHumanBlocks, resolvePageReadinessFromWikiPage } from "@studyagent/wiki-core";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { recordGenerationMetric } from "./generation-metrics.js";
import { fetchOpenRouterJsonCompletion, type OpenRouterJsonClientConfig } from "@studyagent/llm-client";
import { polishWikiPage } from "./wiki-page-polish.js";

const polishResponseSchema = z.object({
  markdown: z.string().min(1),
  pageReadiness: z.enum(["still_improving", "ready_to_study", "needs_more_source_support", "needs_refresh"]),
  sections: z.record(z.string(), z.string()).optional(),
});

const POLISHED_GENERATION_MODES = new Set<GenerationMode>([
  "llm_polished",
  "initial_build",
  "rolling_module_build",
  "llm_repair",
  "tutor_touch",
]);

export type WikiPolishExecutorTarget = {
  notebookId: string;
  pageId: string;
  pageKey: string;
  pageType: "concept" | "topic" | "module" | "curriculum";
  title: string;
  generationMode: GenerationMode;
  trigger: GenerationTarget["trigger"];
  sourceId?: string;
  curriculumId?: string;
  moduleId?: string;
  conceptId?: string;
  idempotencyKey?: string;
};

export type WikiPolishExecutorResult = {
  ok: boolean;
  pageId: string;
  pageKey: string;
  applied: boolean;
  fallbackUsed: boolean;
  pageReadiness: PageReadiness;
  learnerStatusLabel: string;
  qualityIssues: PageQualityIssue[];
  reason?: string;
};

const DEBUG_METADATA_PATTERNS = [
  /\bclm_[a-z0-9_]+\b/i,
  /\bcnc_[a-z0-9_]+\b/i,
  /\bconfidence\s*[:=]\s*0?\.\d+/i,
  /\bclaim[_\s-]?status\b/i,
  /\bpipeline\b/i,
  /\bextraction stats\b/i,
];

const REQUIRED_SECTIONS: Record<"module" | "curriculum", string[]> = {
  module: ["goal", "objective"],
  curriculum: ["module", "source"],
};

const ACTIVE_BACKGROUND_POLISH_STATUSES = new Set(["pending", "enqueued", "in_progress"]);

function isForegroundTouchSuperseded(
  structured: Record<string, unknown>,
  target: WikiPolishExecutorTarget,
): boolean {
  if (target.generationMode !== "tutor_touch") return false;
  if (target.trigger === "wiki_polish_enqueue") return false;
  const status = structured.backgroundPolishStatus;
  return typeof status === "string" && ACTIVE_BACKGROUND_POLISH_STATUSES.has(status);
}

function supersededTouchResult(
  page: typeof wikiPages.$inferSelect,
  target: WikiPolishExecutorTarget,
): WikiPolishExecutorResult {
  const readiness = resolvePageReadinessFromWikiPage(page);
  return {
    ok: true,
    pageId: page.id,
    pageKey: page.pageKey,
    applied: false,
    fallbackUsed: false,
    pageReadiness: readiness,
    learnerStatusLabel: learnerLabelForPageReadiness(readiness),
    qualityIssues: [],
    reason: "superseded_by_background_polish",
  };
}

export function evaluatePagePolishQuality(input: {
  pageType: WikiPolishExecutorTarget["pageType"];
  markdown: string;
  sourceClaimIds: string[];
}): PageQualityIssue[] {
  const issues: PageQualityIssue[] = [];
  const markdown = input.markdown.trim();
  if (markdown.length < 80) {
    issues.push({ code: "markdown_too_short", message: "Polished markdown is too short.", severity: "error" });
  }

  const lowered = markdown.toLowerCase();
  if (input.pageType === "module" || input.pageType === "curriculum") {
    for (const section of REQUIRED_SECTIONS[input.pageType]) {
      if (!lowered.includes(section)) {
        issues.push({
          code: "missing_required_section",
          message: `Missing learner-facing section hint for ${section}.`,
          severity: "warning",
          section,
        });
      }
    }
  }

  for (const pattern of DEBUG_METADATA_PATTERNS) {
    if (pattern.test(markdown)) {
      issues.push({
        code: "learner_unsafe_metadata",
        message: "Polished markdown contains learner-unsafe debug metadata.",
        severity: "error",
      });
      break;
    }
  }

  if (input.sourceClaimIds.length > 0 && !/evidence|source-backed|source excerpt/i.test(markdown)) {
    issues.push({
      code: "missing_source_grounding",
      message: "Source-backed page lacks explicit source/Evidence grounding language.",
      severity: "warning",
    });
  }

  return issues;
}

function hasBlockingQualityIssues(issues: PageQualityIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

function openRouterConfig(env: StudyAgentEnv): OpenRouterJsonClientConfig | null {
  if (!env.OPENROUTER_API_KEY) return null;
  return {
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: env.OPENROUTER_BASE_URL,
    model: env.DEFAULT_EXTRACTION_MODEL,
    temperature: 0.15,
    timeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
    label: "wiki_polish",
  };
}

async function loadSourceContext(
  dbClient: DbClient,
  notebookId: string,
  sourceClaimIds: string[],
): Promise<string> {
  if (sourceClaimIds.length === 0) return "";
  const rows = await dbClient.db
    .select({ claimText: claims.claimText })
    .from(claims)
    .where(and(eq(claims.notebookId, notebookId), inArray(claims.id, sourceClaimIds.slice(0, 12))));
  return rows.map((row) => `- ${row.claimText}`).join("\n");
}

function polishSystemPrompt(pageType: "module" | "curriculum"): string {
  const shared = [
    "You polish StudyAgent learner-facing wiki pages.",
    "Return ONLY JSON with keys: markdown, pageReadiness, sections?.",
    "pageReadiness must be one of: still_improving, ready_to_study, needs_more_source_support, needs_refresh.",
    "Use markdown headings and bullets. Do not include claim IDs, confidence scores, or pipeline metadata.",
    "Preserve learner-safe structure and cite source-backed ideas in plain language.",
  ];
  if (pageType === "module") {
    return [
      ...shared,
      "Include Module goal, Concept sequence, Objectives, Checkpoint, and Next action sections.",
    ].join("\n");
  }
  return [
    ...shared,
    "Include What this path covers, Module path, Active module, and Next action sections.",
  ].join("\n");
}

async function requestMarkdownPolishFromLlm(
  env: StudyAgentEnv,
  target: WikiPolishExecutorTarget,
  currentMarkdown: string,
  sourceContext: string,
): Promise<PagePolishOutput | null> {
  if (!env.OPENROUTER_API_KEY) return null;
  try {
    const raw = await fetchOpenRouterJsonCompletion(
      {
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: env.OPENROUTER_BASE_URL,
        model: env.DEFAULT_EXTRACTION_MODEL,
        temperature: 0.15,
        timeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
        label: `wiki_polish:${target.pageType}`,
      },
      [
        { role: "system", content: polishSystemPrompt(target.pageType as "module" | "curriculum") },
        {
          role: "user",
          content: [
            `Page type: ${target.pageType}`,
            `Title: ${target.title}`,
            "",
            "Current page:",
            currentMarkdown.slice(0, 6_000),
            "",
            "Source-backed notes:",
            sourceContext || "(none available)",
          ].join("\n"),
        },
      ],
    );
    const parsed = polishResponseSchema.parse(raw);
    return pagePolishOutputSchema.parse({
      markdown: parsed.markdown,
      pageReadiness: parsed.pageReadiness,
      generationMode: target.generationMode,
      qualityIssues: [],
    });
  } catch {
    return null;
  }
}

async function persistPolishUpdate(
  dbClient: DbClient,
  input: {
    page: typeof wikiPages.$inferSelect;
    idempotencyKey: string;
    target: WikiPolishExecutorTarget;
    nextMarkdown: string;
    pageReadiness: PageReadiness;
    generationMode: GenerationMode;
    qualityIssues: PageQualityIssue[];
    interactiveBlockPlans?: unknown[];
    deepBuilt?: boolean;
  },
): Promise<void> {
  const structured = input.page.structuredJson ?? {};
  const now = new Date();
  await dbClient.db
    .update(wikiPages)
    .set({
      markdown: input.nextMarkdown,
      qualityScore: input.pageReadiness === "ready_to_study" ? 0.82 : 0.68,
      status: "published",
      structuredJson: {
        ...structured,
        pageReadiness: input.pageReadiness,
        generationMode: input.generationMode,
        learnerStatusLabel: learnerLabelForPageReadiness(input.pageReadiness),
        lastGenerationTargetKey: input.idempotencyKey,
        lastPolishedAt: now.toISOString(),
        qualityIssues: input.qualityIssues.filter((issue) => issue.severity === "warning"),
        ...(input.interactiveBlockPlans ? { interactiveBlockPlans: input.interactiveBlockPlans } : {}),
        ...(input.deepBuilt !== undefined ? { deepBuilt: input.deepBuilt } : {}),
        backgroundPolishStatus: "completed",
      },
      updatedAt: now,
    })
    .where(eq(wikiPages.id, input.page.id));
}

async function executeStructuredWikiPagePolish(
  env: StudyAgentEnv,
  dbClient: DbClient,
  target: WikiPolishExecutorTarget,
  page: typeof wikiPages.$inferSelect,
  idempotencyKey: string,
): Promise<WikiPolishExecutorResult> {
  const pageType = target.pageType as "concept" | "topic";
  const sourceExcerpt = await loadSourceContext(dbClient, target.notebookId, page.sourceClaimIds ?? []);
  const humanBlocks = extractHumanBlocks(page.markdown);
  let polished: Awaited<ReturnType<typeof polishWikiPage>>;
  try {
    polished = await polishWikiPage(openRouterConfig(env), {
      pageType,
      title: target.title,
      pageKey: page.pageKey,
      currentMarkdown: page.markdown,
      sourceExcerpt,
      evidenceRefs: [],
      priorHumanMarkdown: page.markdown,
      supportedClaimIds: new Set(page.sourceClaimIds ?? []),
      generationMode: target.generationMode,
      ...(target.conceptId
        ? { conceptRefs: [{ refType: "concept", refId: target.conceptId }] }
        : {}),
    });
  } catch (error) {
    const pageReadiness =
      (page.structuredJson?.pageReadiness as PageReadiness | undefined) ?? "still_improving";
    const now = new Date();
    const qualityIssues: PageQualityIssue[] = [
      { code: "llm_unavailable", message: "LLM polish unavailable.", severity: "error" },
    ];
    await dbClient.db
      .update(wikiPages)
      .set({
        structuredJson: {
          ...(page.structuredJson ?? {}),
          pageReadiness,
          learnerStatusLabel: learnerLabelForPageReadiness(pageReadiness),
          lastPolishAttemptAt: now.toISOString(),
          lastPolishFailureReason: "llm_unavailable",
          qualityIssues,
        },
        updatedAt: now,
      })
      .where(eq(wikiPages.id, page.id));
    recordGenerationMetric({
      eventType: "generation.page.polish.failed",
      outcome: "failure",
      generationMode: target.generationMode,
      trigger: target.trigger,
    });
    return {
      ok: false,
      pageId: page.id,
      pageKey: page.pageKey,
      applied: false,
      fallbackUsed: true,
      pageReadiness,
      learnerStatusLabel: learnerLabelForPageReadiness(pageReadiness),
      qualityIssues,
      reason: error instanceof Error ? `llm_unavailable:${error.message}` : "llm_unavailable",
    };
  }

  if (!polished.output) {
    const pageReadiness =
      (page.structuredJson?.pageReadiness as PageReadiness | undefined) ?? "still_improving";
    recordGenerationMetric({
      eventType: "generation.page.polish.failed",
      outcome: "failure",
      generationMode: target.generationMode,
      trigger: target.trigger,
    });
    return {
      ok: false,
      pageId: page.id,
      pageKey: page.pageKey,
      applied: false,
      fallbackUsed: true,
      pageReadiness,
      learnerStatusLabel: learnerLabelForPageReadiness(pageReadiness),
      qualityIssues: polished.qualityIssues,
      reason: polished.qualityIssues.some((issue) => issue.code === "llm_unavailable")
        ? "llm_unavailable"
        : "quality_gate_failed",
    };
  }

  const [latestPage] = await dbClient.db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.notebookId, target.notebookId), eq(wikiPages.id, page.id)))
    .limit(1);
  const pageForPersist = latestPage ?? page;
  if (isForegroundTouchSuperseded(pageForPersist.structuredJson ?? {}, target)) {
    return supersededTouchResult(pageForPersist, target);
  }

  const nextMarkdown = mergeAgentMarkdownWithHumanBlocks(polished.output.markdown ?? page.markdown, humanBlocks);
  const interactiveBlockPlans = polished.output.blocks.filter(
    (block) => block.kind === "interactive_learning_block",
  );

  await persistPolishUpdate(dbClient, {
    page: pageForPersist,
    idempotencyKey,
    target,
    nextMarkdown,
    pageReadiness: polished.output.readiness,
    generationMode: polished.output.generationMode,
    qualityIssues: polished.qualityIssues,
    interactiveBlockPlans,
    ...(target.pageType === "module" ? { deepBuilt: true } : {}),
  });

  recordGenerationMetric({
    eventType: "generation.page.polish.completed",
    outcome: "success",
    generationMode: polished.output.generationMode,
    trigger: target.trigger,
  });

  return {
    ok: true,
    pageId: page.id,
    pageKey: page.pageKey,
    applied: true,
    fallbackUsed: false,
    pageReadiness: polished.output.readiness,
    learnerStatusLabel: learnerLabelForPageReadiness(polished.output.readiness),
    qualityIssues: polished.qualityIssues,
  };
}

export async function executeWikiPagePolish(
  env: StudyAgentEnv,
  dbClient: DbClient,
  target: WikiPolishExecutorTarget,
): Promise<WikiPolishExecutorResult> {
  const idempotencyKey =
    target.idempotencyKey ??
    buildGenerationIdempotencyKey({
      notebookId: target.notebookId,
      targetType:
        target.pageType === "concept"
          ? "concept_page"
          : target.pageType === "topic"
            ? "topic_page"
            : target.pageType === "module"
              ? "module_page"
              : "curriculum_page",
      targetRef: target.pageId,
      generationMode: target.generationMode,
      trigger: target.trigger,
    });

  const [page] = await dbClient.db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.notebookId, target.notebookId), eq(wikiPages.id, target.pageId)))
    .limit(1);

  if (!page) {
    return {
      ok: false,
      pageId: target.pageId,
      pageKey: target.pageKey,
      applied: false,
      fallbackUsed: true,
      pageReadiness: "still_improving",
      learnerStatusLabel: learnerLabelForPageReadiness("still_improving"),
      qualityIssues: [{ code: "page_missing", message: "Wiki page not found.", severity: "error" }],
      reason: "page_missing",
    };
  }

  const structured = page.structuredJson ?? {};
  if (isForegroundTouchSuperseded(structured, target)) {
    return supersededTouchResult(page, target);
  }
  const storedMode = structured.generationMode as GenerationMode | undefined;
  if (
    structured.lastGenerationTargetKey === idempotencyKey &&
    storedMode &&
    POLISHED_GENERATION_MODES.has(storedMode)
  ) {
    const readiness = resolvePageReadinessFromWikiPage(page);
    recordGenerationMetric({
      eventType: "generation.page.polish.completed",
      outcome: "skipped",
      generationMode: storedMode,
      trigger: target.trigger,
    });
    return {
      ok: true,
      pageId: page.id,
      pageKey: page.pageKey,
      applied: false,
      fallbackUsed: false,
      pageReadiness: readiness,
      learnerStatusLabel: learnerLabelForPageReadiness(readiness),
      qualityIssues: [],
      reason: "idempotent_skip",
    };
  }

  await appendEvent(dbClient, {
    notebookId: target.notebookId,
    eventType: "generation.page.polish.started",
    payload: {
      pageId: page.id,
      pageKey: page.pageKey,
      pageType: target.pageType,
      generationMode: target.generationMode,
      idempotencyKey,
      ...(target.sourceId ? { sourceId: target.sourceId } : {}),
    },
  });

  if (target.pageType === "concept" || target.pageType === "topic") {
    const result = await executeStructuredWikiPagePolish(env, dbClient, target, page, idempotencyKey);
    const eventType = result.ok ? "generation.page.polish.completed" : "generation.page.polish.failed";
    await appendEvent(dbClient, {
      notebookId: target.notebookId,
      eventType,
      payload: {
        pageId: page.id,
        pageKey: page.pageKey,
        pageType: target.pageType,
        generationMode: target.generationMode,
        pageReadiness: result.pageReadiness,
        fallbackUsed: result.fallbackUsed,
        idempotencyKey,
        qualityIssueCodes: result.qualityIssues.map((issue) => issue.code),
        ...(result.reason ? { reason: result.reason } : {}),
        ...(target.sourceId ? { sourceId: target.sourceId } : {}),
      },
    });
    if (result.ok) {
      await appendEvent(dbClient, {
        notebookId: target.notebookId,
        eventType: "generation.page.readiness_changed",
        payload: {
          pageId: page.id,
          pageKey: page.pageKey,
          pageReadiness: result.pageReadiness,
          learnerStatusLabel: result.learnerStatusLabel,
          generationMode: target.generationMode,
          fallbackUsed: false,
        },
      });
    }
    return result;
  }

  const humanBlocks = extractHumanBlocks(page.markdown);
  const sourceContext = await loadSourceContext(dbClient, target.notebookId, page.sourceClaimIds ?? []);
  let polish = await requestMarkdownPolishFromLlm(env, target, page.markdown, sourceContext);
  let qualityIssues: PageQualityIssue[] = polish
    ? evaluatePagePolishQuality({
        pageType: target.pageType,
        markdown: polish.markdown,
        sourceClaimIds: page.sourceClaimIds ?? [],
      })
    : [{ code: "llm_unavailable", message: "LLM polish unavailable.", severity: "error" as const }];

  if (polish && hasBlockingQualityIssues(qualityIssues)) {
    const repair = await requestMarkdownPolishFromLlm(
      env,
      { ...target, generationMode: "llm_repair" },
      `${page.markdown}\n\nRepair notes:\n${qualityIssues.map((issue) => issue.message).join("\n")}`,
      sourceContext,
    );
    if (repair) {
      polish = { ...repair, generationMode: target.generationMode };
      qualityIssues = evaluatePagePolishQuality({
        pageType: target.pageType,
        markdown: repair.markdown,
        sourceClaimIds: page.sourceClaimIds ?? [],
      });
    }
  }

  const fallbackUsed = !polish || hasBlockingQualityIssues(qualityIssues);
  const pageReadiness: PageReadiness = fallbackUsed
    ? ((structured.pageReadiness as PageReadiness | undefined) ?? "still_improving")
    : polish!.pageReadiness;
  const generationMode: GenerationMode = fallbackUsed
    ? ((structured.generationMode as GenerationMode | undefined) ?? "heuristic")
    : target.generationMode;
  const nextMarkdown = fallbackUsed
    ? page.markdown
    : mergeAgentMarkdownWithHumanBlocks(polish!.markdown, humanBlocks);

  if (!fallbackUsed) {
    await persistPolishUpdate(dbClient, {
      page,
      idempotencyKey,
      target,
      nextMarkdown,
      pageReadiness,
      generationMode,
      qualityIssues,
      ...(target.pageType === "module" ? { deepBuilt: true } : {}),
    });
    recordGenerationMetric({
      eventType: "generation.page.polish.completed",
      outcome: "success",
      generationMode,
      trigger: target.trigger,
    });
  } else {
    const now = new Date();
    await dbClient.db
      .update(wikiPages)
      .set({
        structuredJson: {
          ...structured,
          pageReadiness,
          generationMode,
          learnerStatusLabel: learnerLabelForPageReadiness(pageReadiness),
          lastPolishAttemptAt: now.toISOString(),
          lastPolishFailureReason: polish ? "quality_gate_failed" : "llm_unavailable",
          qualityIssues,
        },
        updatedAt: now,
      })
      .where(eq(wikiPages.id, page.id));
    recordGenerationMetric({
      eventType: "generation.page.polish.failed",
      outcome: "failure",
      generationMode: target.generationMode,
      trigger: target.trigger,
    });
  }

  const eventType = fallbackUsed ? "generation.page.polish.failed" : "generation.page.polish.completed";
  await appendEvent(dbClient, {
    notebookId: target.notebookId,
    eventType,
    payload: {
      pageId: page.id,
      pageKey: page.pageKey,
      pageType: target.pageType,
      generationMode,
      pageReadiness,
      fallbackUsed,
      idempotencyKey,
      qualityIssueCodes: qualityIssues.map((issue) => issue.code),
      ...(target.sourceId ? { sourceId: target.sourceId } : {}),
    },
  });

  if (!fallbackUsed) {
    await appendEvent(dbClient, {
      notebookId: target.notebookId,
      eventType: "generation.page.readiness_changed",
      payload: {
        pageId: page.id,
        pageKey: page.pageKey,
        pageReadiness,
        learnerStatusLabel: learnerLabelForPageReadiness(pageReadiness),
        generationMode,
        fallbackUsed: false,
      },
    });
  }

  const result: WikiPolishExecutorResult = {
    ok: !fallbackUsed,
    pageId: page.id,
    pageKey: page.pageKey,
    applied: !fallbackUsed,
    fallbackUsed,
    pageReadiness,
    learnerStatusLabel: learnerLabelForPageReadiness(pageReadiness),
    qualityIssues,
  };
  if (fallbackUsed) {
    result.reason = polish ? "quality_gate_failed" : "llm_unavailable";
  }
  return result;
}
