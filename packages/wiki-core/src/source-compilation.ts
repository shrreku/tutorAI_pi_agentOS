import {
  buildPageConfidenceSummary,
  combineConfidence,
  reinforcementSignalFromCount,
} from "./confidence.js";
import { normalizeGraphRelationKind } from "@studyagent/schemas";
import {
  buildConceptLookup,
  mergeAliases,
  normalizeConceptKey,
  registerConceptLookup,
  resolveConceptId,
  type ExistingConceptRow,
} from "./concept-lookup.js";
import { resolveClaimGraph, type RawExtractedClaim } from "./claim-graph-resolution.js";
import {
  extractHumanBlocks,
  mergeAgentMarkdownWithHumanBlocks,
  type HumanBlock,
} from "./page-blocks.js";
import {
  buildHeuristicConceptPageMarkdown,
  buildHeuristicTopicPageMarkdown,
} from "./page-format.js";
import {
  conceptPageKey,
  resolveCanonicalTopicPageKey,
  type ExistingTopicPageRef,
} from "./topic-concept-resolution.js";
import type {
  PriorWikiPage,
  WikiChangeSet,
  WikiChangeSetConcept,
  WikiChangeSetGraphRelation,
  WikiChangeSetWarning,
  WikiCompilationResult,
  WikiPageBlock,
} from "./wiki-change-set.js";

export type SourceExtractionConcept = {
  name: string;
  conceptType?: string;
  aliases?: string[];
};

export type SourceExtractionClaim = {
  claimText: string;
  claimType?: string;
  conceptNames: string[];
  evidenceChunkId?: string;
};

export type SourceExtractionRelation = {
  fromConcept: string;
  toConcept: string;
  relationType: string;
  confidence?: number;
};

export type SourceExtractionOutput = {
  concepts: SourceExtractionConcept[];
  claims: SourceExtractionClaim[];
  relations: SourceExtractionRelation[];
  sourceSummaryMarkdown: string;
};

export type ExistingNotebookClaimInput = {
  id: string;
  sourceId: string;
  claimText: string;
  createdAtMs: number;
  status: string;
};

export type CompileSourceWikiInput = {
  notebookId: string;
  sourceId: string;
  sourceVersionId: string;
  sourceTitle: string;
  chunkIds: string[];
  maxConceptPages?: number;
  extraction: SourceExtractionOutput;
  existingConcepts: ExistingConceptRow[];
  existingClaims: ExistingNotebookClaimInput[];
  priorWikiPages: PriorWikiPage[];
  focusedRelations?: SourceExtractionRelation[];
  now?: Date;
  nextId?: (prefix: string) => string;
};

type NormalizedRelationType = "depends_on" | "supports" | "example_of" | "contradicts" | "covers";

type ConceptRelationCandidate = {
  fromId: string;
  toId: string;
  relationType: NormalizedRelationType;
  confidence: number;
  sourceClaimIds: string[];
  sourceChunkIds: string[];
};

function defaultNextId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll("-", "")}`;
}

function uniqueChunkIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function normalizeRelationType(value: string): NormalizedRelationType | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "depends_on":
    case "supports":
    case "example_of":
    case "contradicts":
    case "covers":
      return normalized;
    case "related_to":
    case "relates_to":
    case "describes":
    case "illustrates":
      return "covers";
    case "based_on":
    case "requires":
    case "prerequisite_for":
      return "depends_on";
    case "implies":
    case "explains":
      return "supports";
    default:
      return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTextForMatch(value: string): string {
  return normalizeConceptKey(value);
}

function orderedConceptPairs(
  conceptIds: string[],
  conceptNames: Map<string, string>,
): Array<[string, string]> {
  const uniq = [...new Set(conceptIds)];
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < uniq.length; i += 1) {
    for (let j = 0; j < uniq.length; j += 1) {
      if (i === j) continue;
      const a = conceptNames.get(uniq[i]!);
      const b = conceptNames.get(uniq[j]!);
      if (!a || !b) continue;
      pairs.push([uniq[i]!, uniq[j]!]);
    }
  }
  return pairs;
}

function inferConceptRelationsFromClaims(
  claimsMeta: Array<{ id: string; text: string; conceptIds: string[]; chunkIds: string[] }>,
  conceptNames: Map<string, string>,
): ConceptRelationCandidate[] {
  const inferred: ConceptRelationCandidate[] = [];

  for (const claim of claimsMeta) {
    // A relation inferred from claim prose inherits that claim's evidence. Do
    // not turn an unprovenanced LLM claim into an apparently grounded graph edge.
    if (claim.chunkIds.length === 0) continue;
    if (claim.conceptIds.length < 2) continue;
    const text = normalizeTextForMatch(claim.text);

    for (const [fromId, toId] of orderedConceptPairs(claim.conceptIds, conceptNames)) {
      const fromName = conceptNames.get(fromId);
      const toName = conceptNames.get(toId);
      if (!fromName || !toName) continue;

      const fromKey = escapeRegExp(normalizeTextForMatch(fromName));
      const toKey = escapeRegExp(normalizeTextForMatch(toName));

      const rules: Array<{ relationType: NormalizedRelationType; pattern: RegExp }> = [
        {
          relationType: "depends_on",
          pattern: new RegExp(`\\b${fromKey}\\b.*\\bdepends on\\b.*\\b${toKey}\\b`),
        },
        {
          relationType: "depends_on",
          pattern: new RegExp(`\\b${fromKey}\\b.*\\bis governed by\\b.*\\b${toKey}\\b`),
        },
        {
          relationType: "depends_on",
          pattern: new RegExp(`\\b${toKey}\\b.*\\bgoverns\\b.*\\b${fromKey}\\b`),
        },
        {
          relationType: "depends_on",
          pattern: new RegExp(`\\b${toKey}\\b.*\\bdefines\\b.*\\b${fromKey}\\b`),
        },
        {
          relationType: "supports",
          pattern: new RegExp(`\\b${fromKey}\\b.*\\bimplies\\b.*\\b${toKey}\\b`),
        },
        {
          relationType: "supports",
          pattern: new RegExp(`\\b${fromKey}\\b.*\\bindicates\\b.*\\b${toKey}\\b`),
        },
        {
          relationType: "covers",
          pattern: new RegExp(`\\b${fromKey}\\b.*\\bapplies to\\b.*\\b${toKey}\\b`),
        },
        {
          relationType: "example_of",
          pattern: new RegExp(`\\b${fromKey}\\b.*\\bis (?:an|a|the)\\b.*\\b${toKey}\\b`),
        },
      ];

      const matched = rules.find((rule) => rule.pattern.test(text));
      if (!matched) continue;

      inferred.push({
        fromId,
        toId,
        relationType: matched.relationType,
        confidence: 0.66,
        sourceClaimIds: [claim.id],
        sourceChunkIds: claim.chunkIds,
      });
    }
  }

  return inferred;
}

function upsertConceptRelationCandidate(
  relationMap: Map<string, ConceptRelationCandidate>,
  candidate: ConceptRelationCandidate,
): void {
  if (candidate.fromId === candidate.toId) return;
  const key = `${candidate.fromId}|${candidate.relationType}|${candidate.toId}`;
  const existing = relationMap.get(key);
  if (!existing) {
    relationMap.set(key, {
      ...candidate,
      sourceClaimIds: uniqueChunkIds(candidate.sourceClaimIds),
      sourceChunkIds: uniqueChunkIds(candidate.sourceChunkIds),
    });
    return;
  }

  existing.confidence = Math.max(existing.confidence, candidate.confidence);
  existing.sourceClaimIds = uniqueChunkIds([
    ...existing.sourceClaimIds,
    ...candidate.sourceClaimIds,
  ]);
  existing.sourceChunkIds = uniqueChunkIds([
    ...existing.sourceChunkIds,
    ...candidate.sourceChunkIds,
  ]);
}

function learnerSupportStatus(relatedClaims: Array<{ confidence: number }>): string | null {
  const backed = relatedClaims.filter((claim) => claim.confidence >= 0.45);
  if (backed.length === 0) return "Needs more source support";
  if (backed.some((claim) => claim.confidence < 0.65)) return "Still improving";
  return null;
}

function bulletList(items: string[], emptyMessage: string): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : emptyMessage;
}

export function buildConceptPageMarkdown(
  conceptName: string,
  relatedClaims: Array<{ id: string; text: string; confidence: number }>,
): string {
  return buildHeuristicConceptPageMarkdown({
    conceptName,
    claims: relatedClaims.map((claim) => ({ text: claim.text, confidence: claim.confidence })),
  }).markdown;
}

export function normalizeSourceSummaryMarkdown(markdown: string, sourceTitle: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return [
      `# ${sourceTitle}`,
      "",
      "## Overview",
      "Still improving — this source summary will grow as ingestion completes.",
    ].join("\n");
  }
  if (/^#\s/m.test(trimmed)) return trimmed;
  return [`# ${sourceTitle}`, "", "## Overview", trimmed].join("\n\n");
}

function topicTitleFromSummaryMarkdown(markdown: string, sourceTitle: string): string {
  const firstHeadingMatch = markdown.match(/^#\s+(.+)$/m) ?? markdown.match(/^##\s+(.+)$/m);
  const heading = firstHeadingMatch?.[1]?.trim() ?? "";
  const sourceStem = sourceTitle.replace(/\.[a-z0-9]+$/i, "").trim();
  if (heading.length === 0) return sourceStem || sourceTitle;
  if (
    /^(overview|summary|source summary|chapter\s+\d+|lesson\s+\d+)$/i.test(heading) &&
    sourceStem.length > 0
  ) {
    return sourceStem;
  }
  return heading;
}

function buildTopicPageMarkdown(
  topicTitle: string,
  sourceSummaryMarkdown: string,
  claims: ClaimBullet[] = [],
): string {
  const trimmedSummary = sourceSummaryMarkdown.trim();
  const body = trimmedSummary.replace(/^#\s+.*(?:\r?\n)+/, "").trim();
  const overviewBullets =
    body.length > 0
      ? body
          .split(/\n+/)
          .map((line) => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
  return buildHeuristicTopicPageMarkdown({
    topicTitle,
    overviewBullets,
    claims,
    concepts: [],
  }).markdown;
}

type ClaimBullet = { text: string; confidence: number };

function pageBlocksFromMarkdown(agentMarkdown: string, humanBlocks: HumanBlock[]): WikiPageBlock[] {
  const blocks: WikiPageBlock[] = [{ origin: "generated", markdown: agentMarkdown.trim() }];
  for (const block of humanBlocks) {
    blocks.push({ origin: "human", id: block.id, markdown: block.body });
  }
  return blocks;
}

function extractPriorHumanBlocks(priorWikiPages: PriorWikiPage[]): Map<string, HumanBlock[]> {
  const map = new Map<string, HumanBlock[]>();
  for (const page of priorWikiPages) {
    map.set(page.pageKey, extractHumanBlocks(page.markdown));
  }
  return map;
}

function compileFingerprint(input: CompileSourceWikiInput): string {
  const payload = JSON.stringify({
    sourceId: input.sourceId,
    sourceVersionId: input.sourceVersionId,
    extraction: input.extraction,
    human: input.priorWikiPages.map((p) => ({
      pageKey: p.pageKey,
      blocks: extractHumanBlocks(p.markdown),
    })),
    conceptIds: input.existingConcepts.map((c) => c.id).sort(),
  });
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return `wcs_${hash.toString(16)}`;
}

export function compileSourceToWikiChangeSet(input: CompileSourceWikiInput): WikiCompilationResult {
  const warnings: WikiChangeSetWarning[] = [];
  const nextId = input.nextId ?? defaultNextId;
  const now = input.now ?? new Date();
  const chunkIdSet = new Set(input.chunkIds);
  const maxConceptPages =
    typeof input.maxConceptPages === "number" && input.maxConceptPages > 0
      ? Math.floor(input.maxConceptPages)
      : null;

  if (input.chunkIds.length === 0) {
    return {
      ok: false,
      reasons: [
        {
          code: "no_source_chunks",
          message: "Cannot compile wiki without source chunks.",
          severity: "error",
        },
      ],
    };
  }

  if (input.extraction.concepts.length === 0 && input.extraction.claims.length === 0) {
    return {
      ok: false,
      reasons: [
        {
          code: "empty_extraction",
          message: "Extraction produced no concepts or claims.",
          severity: "error",
        },
      ],
    };
  }

  const normalizedRelations = [...input.extraction.relations, ...(input.focusedRelations ?? [])]
    .map((relation) => {
      const relationType = normalizeGraphRelationKind(relation.relationType);
      if (!relationType) return null;
      return { ...relation, relationType };
    })
    .filter(Boolean) as Array<SourceExtractionRelation & { relationType: NormalizedRelationType }>;

  const { lookup: conceptLookup, byId: conceptsById } = buildConceptLookup(input.existingConcepts);
  const conceptChanges: WikiChangeSetConcept[] = [];
  const conceptIdByName = new Map<string, string>();

  for (const concept of input.extraction.concepts) {
    const canonicalName = concept.name.trim();
    const incomingAliases = mergeAliases([], concept.aliases ?? []);
    const existingId = resolveConceptId(conceptLookup, canonicalName);
    if (existingId) {
      conceptIdByName.set(canonicalName, existingId);
      const existing = conceptsById.get(existingId);
      if (existing) {
        const mergedAliases = mergeAliases(existing.aliases ?? [], incomingAliases);
        if (mergedAliases.length !== (existing.aliases ?? []).length) {
          conceptChanges.push({
            id: existingId,
            canonicalName: existing.canonicalName,
            aliases: mergedAliases,
            conceptType: concept.conceptType ?? "term",
            action: "update",
          });
          registerConceptLookup(conceptLookup, existingId, [
            existing.canonicalName,
            ...mergedAliases,
            canonicalName,
          ]);
        } else {
          registerConceptLookup(conceptLookup, existingId, [
            existing.canonicalName,
            ...mergedAliases,
            canonicalName,
          ]);
        }
      }
      continue;
    }
    const id = nextId("cnc_");
    conceptIdByName.set(canonicalName, id);
    registerConceptLookup(conceptLookup, id, [canonicalName, ...incomingAliases]);
    conceptChanges.push({
      id,
      canonicalName,
      aliases: incomingAliases,
      conceptType: concept.conceptType ?? "term",
      action: "create",
    });
    conceptsById.set(id, { id, canonicalName, aliases: incomingAliases });
  }

  const conceptNamesById = new Map([...conceptsById.values()].map((c) => [c.id, c.canonicalName]));
  const rawClaims: RawExtractedClaim[] = [];
  let claimsMissingEvidence = 0;

  for (const claim of input.extraction.claims) {
    const claimId = nextId("clm_");
    const hadChunkEvidence = Boolean(
      claim.evidenceChunkId && chunkIdSet.has(claim.evidenceChunkId),
    );
    // Do not fabricate provenance: when the extractor omits evidenceChunkId or cites a chunk
    // that is not part of this source, record the claim with NO evidence chunk (and lower
    // sourceSupport) instead of mis-citing the document's first chunk. Learner-facing
    // surfaces treat a claim with empty sourceChunkIds as not source-backed (see
    // isLearnerSafeClaim), so a fabricated citation would otherwise leak an unsupported
    // claim onto the Evidence trust surface.
    const chunkList = hadChunkEvidence ? [claim.evidenceChunkId!] : [];
    if (!hadChunkEvidence) claimsMissingEvidence += 1;
    const confidenceComponents = {
      sourceSupport: hadChunkEvidence ? 0.76 : 0.58,
      extractionConfidence: 0.68,
      recency: 0.88,
      contradictionPenalty: 0,
      humanApproval: 0,
      reinforcementSignal: reinforcementSignalFromCount(0),
    };
    const linkedConceptIds = claim.conceptNames
      .map(
        (cn) =>
          resolveConceptId(conceptLookup, cn.trim()) ?? conceptIdByName.get(cn.trim()) ?? null,
      )
      .filter(Boolean) as string[];

    rawClaims.push({
      id: claimId,
      claimText: claim.claimText.trim(),
      claimType: claim.claimType ?? "fact",
      conceptIds: linkedConceptIds,
      evidenceChunkIds: chunkList,
      confidenceComponents,
    });
  }

  if (claimsMissingEvidence > 0) {
    warnings.push({
      code: "claim.missing_evidence",
      message: `${claimsMissingEvidence} of ${input.extraction.claims.length} extracted claim(s) had no valid source evidence chunk and were recorded without provenance.`,
      severity: "warn",
      context: {
        claimsMissingEvidence,
        totalClaims: input.extraction.claims.length,
      },
    });
  }

  const insertedClaimMeta = rawClaims.map((c) => ({
    id: c.id,
    text: c.claimText,
    conceptIds: c.conceptIds,
    chunkIds: c.evidenceChunkIds,
    confidence: combineConfidence(c.confidenceComponents),
    confidenceComponents: c.confidenceComponents,
  }));

  const supportedExplicitRelations = normalizedRelations.flatMap((rel) => {
    const fromId =
      resolveConceptId(conceptLookup, rel.fromConcept.trim()) ??
      conceptIdByName.get(rel.fromConcept.trim());
    const toId =
      resolveConceptId(conceptLookup, rel.toConcept.trim()) ??
      conceptIdByName.get(rel.toConcept.trim());
    if (!fromId || !toId || fromId === toId) return [];

    const supportingClaims = insertedClaimMeta.filter(
      (claim) =>
        claim.chunkIds.length > 0 &&
        claim.conceptIds.includes(fromId) &&
        claim.conceptIds.includes(toId),
    );
    if (supportingClaims.length === 0) return [];

    return [
      {
        ...rel,
        fromId,
        toId,
        sourceClaimIds: supportingClaims.map((claim) => claim.id),
        sourceChunkIds: uniqueChunkIds(supportingClaims.flatMap((claim) => claim.chunkIds)),
      },
    ];
  });

  if (supportedExplicitRelations.length < normalizedRelations.length) {
    warnings.push({
      code: "relation.missing_evidence",
      message: `${normalizedRelations.length - supportedExplicitRelations.length} extracted relation(s) were omitted because no source-backed claim connected both concepts.`,
      severity: "warn",
    });
  }

  const relationCandidates = new Map<string, ConceptRelationCandidate>();
  for (const rel of supportedExplicitRelations) {
    upsertConceptRelationCandidate(relationCandidates, {
      fromId: rel.fromId,
      toId: rel.toId,
      relationType: rel.relationType,
      confidence: rel.confidence ?? 0.72,
      sourceClaimIds: rel.sourceClaimIds,
      sourceChunkIds: rel.sourceChunkIds,
    });
  }

  for (const relation of inferConceptRelationsFromClaims(insertedClaimMeta, conceptNamesById)) {
    upsertConceptRelationCandidate(relationCandidates, relation);
  }

  const conceptGraphRelations: WikiChangeSetGraphRelation[] = [...relationCandidates.values()].map(
    (relation) => ({
      id: nextId("gre_"),
      sourceNodeType: "concept" as const,
      sourceNodeId: relation.fromId,
      targetNodeType: "concept" as const,
      targetNodeId: relation.toId,
      relationType: relation.relationType,
      confidence: relation.confidence,
      sourceClaimIds: relation.sourceClaimIds,
      sourceChunkIds: relation.sourceChunkIds,
      metadataJson: { ingestionSourceId: input.sourceId },
    }),
  );

  const contradictionEdges = supportedExplicitRelations
    .filter((r) => r.relationType === "contradicts")
    .map((r) => ({
      fromConceptId: r.fromId,
      toConceptId: r.toId,
      sourceClaimIds: r.sourceClaimIds,
      sourceChunkIds: r.sourceChunkIds,
    }));

  const resolved = resolveClaimGraph({
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    ingestionSourceId: input.sourceId,
    nowMs: now.getTime(),
    newClaims: rawClaims,
    existingClaims: input.existingClaims,
    contradictionEdges,
    nextRelationId: () => nextId("gre_"),
  });

  warnings.push(...resolved.warnings);

  const humanBlocksByPageKey = extractPriorHumanBlocks(input.priorWikiPages);
  const sourceSummaryPageKey = `source:${input.sourceId}`;
  const sourceSummaryChunkIds = uniqueChunkIds(insertedClaimMeta.flatMap((m) => m.chunkIds));
  const sourceSummaryAgentMd = normalizeSourceSummaryMarkdown(
    input.extraction.sourceSummaryMarkdown,
    input.sourceTitle,
  );
  const sourceSummaryMerged = mergeAgentMarkdownWithHumanBlocks(
    sourceSummaryAgentMd,
    humanBlocksByPageKey.get(sourceSummaryPageKey) ?? [],
  );
  const topicTitle = topicTitleFromSummaryMarkdown(sourceSummaryAgentMd, input.sourceTitle);
  const existingTopicPages: ExistingTopicPageRef[] = input.priorWikiPages
    .filter((page) => page.pageType === "topic")
    .map((page) => ({
      pageKey: page.pageKey,
      title:
        page.markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
        page.pageKey.replace(/^topic:/, "").replace(/_/g, " "),
    }));
  const topicResolution = resolveCanonicalTopicPageKey({
    topicTitle,
    sourceId: input.sourceId,
    sourceHeadingPath: [topicTitle],
    existingTopicPages,
  });
  const topicPageKey = topicResolution.pageKey;

  const conceptRanking = input.extraction.concepts
    .map((concept, index) => ({
      concept,
      index,
      relatedClaims: insertedClaimMeta.filter((claim) =>
        claim.conceptIds.includes(
          resolveConceptId(conceptLookup, concept.name.trim()) ??
            conceptIdByName.get(concept.name.trim()) ??
            "",
        ),
      ),
    }))
    .sort((left, right) => {
      if (right.relatedClaims.length !== left.relatedClaims.length)
        return right.relatedClaims.length - left.relatedClaims.length;
      return left.index - right.index;
    });
  const selectedConcepts = maxConceptPages
    ? conceptRanking.slice(0, maxConceptPages)
    : conceptRanking;
  const selectedConceptIds = new Set(
    selectedConcepts
      .map(
        ({ concept }) =>
          resolveConceptId(conceptLookup, concept.name.trim()) ??
          conceptIdByName.get(concept.name.trim()) ??
          null,
      )
      .filter((conceptId): conceptId is string => Boolean(conceptId)),
  );

  if (maxConceptPages !== null && selectedConcepts.length < input.extraction.concepts.length) {
    warnings.push({
      code: "concept_page_batch_limited",
      message: `Generated only the top ${selectedConcepts.length} concept pages for this source batch.`,
      severity: "info",
      context: {
        selectedConceptCount: selectedConcepts.length,
        omittedConceptCount: input.extraction.concepts.length - selectedConcepts.length,
      },
    });
  }

  const topicClaimBullets: ClaimBullet[] = insertedClaimMeta
    .filter((claim) => claim.confidence >= 0.45)
    .slice(0, 8)
    .map((claim) => ({ text: claim.text, confidence: claim.confidence }));
  const legacyTopicHumanBlocks =
    humanBlocksByPageKey.get(topicPageKey) ??
    humanBlocksByPageKey.get(`topic:${input.sourceId}`) ??
    [];
  const topicHeuristic = buildHeuristicTopicPageMarkdown({
    topicTitle,
    overviewBullets: topicClaimBullets.map((claim) => claim.text).slice(0, 4),
    claims: topicClaimBullets,
    concepts: selectedConcepts
      .slice(0, 8)
      .map(({ concept }) => {
        const conceptId = conceptIdByName.get(concept.name.trim());
        return conceptId ? { id: conceptId, name: concept.name.trim() } : null;
      })
      .filter((entry): entry is { id: string; name: string } => Boolean(entry)),
    ...(legacyTopicHumanBlocks.length > 0
      ? { existingMarkdown: mergeAgentMarkdownWithHumanBlocks("", legacyTopicHumanBlocks) }
      : {}),
  });
  const topicAgentMd = topicHeuristic.markdown;
  const topicPageMerged = topicAgentMd;
  const topicConceptIds = selectedConcepts
    .map(({ concept }) => conceptIdByName.get(concept.name.trim()) ?? null)
    .filter((conceptId): conceptId is string => Boolean(conceptId));

  const deleteWikiPageKeys = [
    ...new Set(
      input.priorWikiPages
        .filter((p) => p.pageType === "concept" || p.pageType === "topic")
        .filter((p) => {
          if (p.pageType === "topic") {
            if (p.pageKey === topicPageKey) return true;
            if (topicResolution.legacyPageKeysToRetire.includes(p.pageKey)) return true;
            return p.pageKey === `topic:${input.sourceId}` && p.pageKey !== topicPageKey;
          }
          const conceptId = p.pageKey.startsWith("concept:")
            ? p.pageKey.slice("concept:".length)
            : null;
          if (!conceptId) return true;
          return !maxConceptPages || selectedConceptIds.has(conceptId);
        })
        .map((p) => p.pageKey),
    ),
  ];

  const wikiPages: WikiChangeSet["wikiPages"] = [
    {
      id: nextId("wp_"),
      pageType: "topic",
      pageKey: topicPageKey,
      title: `Topic · ${topicTitle}`,
      markdown: topicPageMerged,
      blocks: pageBlocksFromMarkdown(topicAgentMd, humanBlocksByPageKey.get(topicPageKey) ?? []),
      sourceClaimIds: insertedClaimMeta.map((m) => m.id),
      sourceChunkIds: sourceSummaryChunkIds.length ? sourceSummaryChunkIds : input.chunkIds,
      structuredJson: {
        sourceId: input.sourceId,
        sourceVersionId: input.sourceVersionId,
        bootstrapSourceId: input.sourceId,
        topicTitle,
        topicKey: topicPageKey,
        sourceHeadingPath: [topicTitle],
        conceptIds: topicConceptIds,
        pageReadiness: topicHeuristic.readiness,
        generationMode: topicHeuristic.generationMode,
        ...topicHeuristic.structuredJson,
      },
      confidenceSummaryJson: {
        ...buildPageConfidenceSummary({
          claimConfidences: insertedClaimMeta.map((m) => m.confidence),
          claimComponentSamples: insertedClaimMeta.map((m) => m.confidenceComponents),
        }),
      },
      qualityScore: 0.68,
    },
    {
      id: nextId("wp_"),
      pageType: "source_summary",
      pageKey: sourceSummaryPageKey,
      title: `Source · ${input.sourceTitle}`,
      markdown: sourceSummaryMerged,
      blocks: pageBlocksFromMarkdown(
        sourceSummaryAgentMd,
        humanBlocksByPageKey.get(sourceSummaryPageKey) ?? [],
      ),
      sourceClaimIds: insertedClaimMeta.map((m) => m.id),
      sourceChunkIds: sourceSummaryChunkIds.length ? sourceSummaryChunkIds : input.chunkIds,
      structuredJson: { sourceId: input.sourceId, sourceVersionId: input.sourceVersionId },
      confidenceSummaryJson: {
        ...buildPageConfidenceSummary({
          claimConfidences: insertedClaimMeta.map((m) => m.confidence),
          claimComponentSamples: insertedClaimMeta.map((m) => m.confidenceComponents),
        }),
      },
      qualityScore: 0.7,
    },
  ];

  const events: WikiChangeSet["events"] = [
    {
      eventType: "generation.page.heuristic.created",
      payload: {
        pageId: wikiPages[0]!.id,
        pageType: "topic",
        pageKey: topicPageKey,
        sourceId: input.sourceId,
        topicTitle,
        readiness: topicHeuristic.readiness,
      },
    },
    {
      eventType: "wiki.page.compiled",
      payload: {
        pageId: wikiPages[0]!.id,
        pageType: "topic",
        pageKey: topicPageKey,
        sourceId: input.sourceId,
        topicTitle,
      },
    },
    {
      eventType: "wiki.page.compiled",
      payload: {
        pageId: wikiPages[1]!.id,
        pageType: "source_summary",
        pageKey: sourceSummaryPageKey,
        sourceId: input.sourceId,
      },
    },
  ];

  for (const { concept, relatedClaims } of selectedConcepts) {
    const cid = conceptIdByName.get(concept.name.trim());
    if (!cid) continue;
    const pageKey = conceptPageKey(cid);
    const humanBlocks = humanBlocksByPageKey.get(pageKey) ?? [];
    const claimBullets = relatedClaims.map((claim) => ({
      text: claim.text,
      confidence: claim.confidence,
    }));
    const conceptHeuristic = buildHeuristicConceptPageMarkdown({
      conceptName: concept.name.trim(),
      claims: claimBullets,
      ...(humanBlocks.length > 0
        ? { existingMarkdown: mergeAgentMarkdownWithHumanBlocks("", humanBlocks) }
        : {}),
    });
    const agentMd = conceptHeuristic.markdown;
    const conceptPageId = nextId("wp_");
    wikiPages.push({
      id: conceptPageId,
      pageType: "concept",
      pageKey,
      title: `Concept · ${concept.name.trim()}`,
      markdown: agentMd,
      blocks: pageBlocksFromMarkdown(agentMd, humanBlocks),
      sourceClaimIds: relatedClaims.map((m) => m.id),
      sourceChunkIds: uniqueChunkIds(relatedClaims.flatMap((m) => m.chunkIds)),
      structuredJson: {
        conceptId: cid,
        bootstrapSourceId: input.sourceId,
        pageReadiness: conceptHeuristic.readiness,
        generationMode: conceptHeuristic.generationMode,
        ...conceptHeuristic.structuredJson,
      },
      confidenceSummaryJson: {
        ...buildPageConfidenceSummary({
          claimConfidences: relatedClaims.map((m) => m.confidence),
          claimComponentSamples: relatedClaims.map((m) => m.confidenceComponents),
        }),
      },
      qualityScore: 0.65,
    });
    events.push({
      eventType: "generation.page.heuristic.created",
      payload: {
        pageId: conceptPageId,
        pageType: "concept",
        pageKey,
        conceptId: cid,
        readiness: conceptHeuristic.readiness,
      },
    });
    events.push({
      eventType: "wiki.page.compiled",
      payload: { pageId: conceptPageId, pageType: "concept", pageKey, conceptId: cid },
    });
  }

  const changeSet: WikiChangeSet = {
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    sourceVersionId: input.sourceVersionId,
    sourceTitle: input.sourceTitle,
    compiledAt: now.toISOString(),
    fingerprint: compileFingerprint(input),
    concepts: conceptChanges,
    claims: resolved.claims,
    claimPatches: resolved.claimPatches,
    graphRelations: [...conceptGraphRelations, ...resolved.graphRelations],
    wikiPages,
    deleteWikiPageKeys,
    deleteClaimsForSource: true,
    deleteGraphRelationsForSource: true,
    warnings,
    events: [...events, ...resolved.events],
  };

  return { ok: true, changeSet };
}
