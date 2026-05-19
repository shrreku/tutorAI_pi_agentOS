import type { WikiPagePolishCandidate, WikiPolishCandidateStatus } from "@studyagent/schemas";
import { learnerStatusLabelForPolishCandidate } from "@studyagent/schemas";

export type WikiPolishPageInput = {
  id: string;
  pageKey: string;
  pageType: "concept" | "source_summary" | "topic";
  title: string;
  qualityScore: number | null;
  status: string;
  sourceId: string | null;
  sourceChunkIds: string[];
  conceptId?: string | null;
  structuredJson?: Record<string, unknown>;
  updatedAt?: string | null;
};

export type BuildWikiPolishQueueInput = {
  pages: WikiPolishPageInput[];
  weakConceptIds?: string[];
  targetConceptIds?: string[];
  recentlyUsedPageIds?: string[];
  sourceCoverageGapPageKeys?: string[];
  largeSourceConceptCount?: number;
  now?: Date;
};

export function buildWikiPolishQueue(input: BuildWikiPolishQueueInput): WikiPagePolishCandidate[] {
  const now = input.now ?? new Date();
  const weakSet = new Set(input.weakConceptIds ?? []);
  const targetSet = new Set(input.targetConceptIds ?? []);
  const recentSet = new Set(input.recentlyUsedPageIds ?? []);
  const gapKeys = new Set(input.sourceCoverageGapPageKeys ?? []);
  const isLargeSource = (input.largeSourceConceptCount ?? 0) >= 8;

  const candidates = input.pages.map((page) => scoreWikiPolishCandidate(page, {
    weakSet,
    targetSet,
    recentSet,
    gapKeys,
    isLargeSource,
    now,
  }));

  return candidates
    .filter((candidate) => candidate.status !== "skipped" || candidate.priorityScore > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

function scoreWikiPolishCandidate(
  page: WikiPolishPageInput,
  ctx: {
    weakSet: Set<string>;
    targetSet: Set<string>;
    recentSet: Set<string>;
    gapKeys: Set<string>;
    isLargeSource: boolean;
    now: Date;
  },
): WikiPagePolishCandidate {
  const reasons: string[] = [];
  let score = 0;
  const conceptId = page.conceptId ?? (typeof page.structuredJson?.conceptId === "string" ? page.structuredJson.conceptId : null);
  const lastPolishedAt =
    typeof page.structuredJson?.lastPolishedAt === "string" ? page.structuredJson.lastPolishedAt : null;
  const quality = page.qualityScore ?? 0.5;

  if (lastPolishedAt && quality >= 0.75) {
    return finalizeCandidate(page, {
      priorityScore: 0.05,
      reasons: ["already_polished"],
      status: "skipped",
      lastPolishedAt,
      learnerSignalRefs: [],
    });
  }

  if (conceptId && ctx.weakSet.has(conceptId)) {
    score += 0.35;
    reasons.push("weak_concept_priority");
  }
  if (conceptId && ctx.targetSet.has(conceptId)) {
    score += 0.2;
    reasons.push("curriculum_priority");
  }
  if (ctx.recentSet.has(page.id)) {
    score += 0.25;
    reasons.push("recently_used");
  }
  if (ctx.gapKeys.has(page.pageKey)) {
    score += 0.3;
    reasons.push("source_coverage_gap");
  }
  if (quality < 0.62) {
    score += 0.22;
    reasons.push("low_page_quality");
  }
  if (ctx.isLargeSource && page.pageType === "concept") {
    score += 0.08;
    reasons.push("large_source_bootstrap");
  }
  if (page.status !== "published") {
    score += 0.1;
    reasons.push("unpublished_page");
  }

  const status: WikiPolishCandidateStatus = score >= 0.45 ? "queued" : score >= 0.2 ? "queued" : "skipped";
  const learnerSignalRefs = [
    ...(conceptId && ctx.weakSet.has(conceptId) ? [{ refType: "concept" as const, refId: conceptId }] : []),
    ...(page.sourceId ? [{ refType: "source" as const, refId: page.sourceId }] : []),
  ];

  return finalizeCandidate(page, {
    priorityScore: Math.min(1, score),
    reasons: reasons.length ? reasons : ["low_priority"],
    status,
    lastPolishedAt,
    learnerSignalRefs,
  });
}

function finalizeCandidate(
  page: WikiPolishPageInput,
  scored: {
    priorityScore: number;
    reasons: string[];
    status: WikiPolishCandidateStatus;
    lastPolishedAt: string | null;
    learnerSignalRefs: Array<{ refType: "concept" | "source"; refId: string }>;
  },
): WikiPagePolishCandidate {
  const sourceRefs = [
    ...(page.sourceId ? [{ refType: "source" as const, refId: page.sourceId }] : []),
    ...page.sourceChunkIds.slice(0, 4).map((refId) => ({ refType: "chunk" as const, refId })),
  ];
  return {
    pageRef: { refType: "wiki_page", refId: page.id },
    pageKey: page.pageKey,
    pageType: page.pageType,
    title: page.title,
    priorityScore: scored.priorityScore,
    reasons: scored.reasons,
    sourceRefs,
    learnerSignalRefs: scored.learnerSignalRefs,
    status: scored.status,
    lastPolishedAt: scored.lastPolishedAt,
    learnerStatusLabel: learnerStatusLabelForPolishCandidate({
      status: scored.status,
      reasons: scored.reasons,
    }),
  };
}

export function enqueueWikiPagePolishRepair(
  pages: WikiPolishPageInput[],
  pageRefId: string,
): WikiPagePolishCandidate | null {
  const page = pages.find((entry) => entry.id === pageRefId);
  if (!page) return null;
  const [candidate] = buildWikiPolishQueue({
    pages: [page],
    recentlyUsedPageIds: [pageRefId],
    weakConceptIds: [],
    targetConceptIds: [],
  });
  if (!candidate) return null;
  return {
    ...candidate,
    priorityScore: Math.max(candidate.priorityScore, 0.85),
    reasons: [...new Set([...candidate.reasons, "tutor_triggered_repair"])],
    status: "queued",
    learnerStatusLabel: "Improving this page next",
  };
}
