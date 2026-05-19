import { buildPageConfidenceSummary, combineConfidence, reinforcementSignalFromCount } from "./confidence.js";
import {
  buildConceptLookup,
  mergeAliases,
  normalizeConceptKey,
  registerConceptLookup,
  resolveConceptId,
  type ExistingConceptRow,
} from "./concept-lookup.js";
import { resolveClaimGraph, type RawExtractedClaim } from "./claim-graph-resolution.js";
import { extractHumanBlocks, mergeAgentMarkdownWithHumanBlocks, type HumanBlock } from "./page-blocks.js";
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
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
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

function orderedConceptPairs(conceptIds: string[], conceptNames: Map<string, string>): Array<[string, string]> {
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
    if (claim.conceptIds.length < 2) continue;
    const text = normalizeTextForMatch(claim.text);

    for (const [fromId, toId] of orderedConceptPairs(claim.conceptIds, conceptNames)) {
      const fromName = conceptNames.get(fromId);
      const toName = conceptNames.get(toId);
      if (!fromName || !toName) continue;

      const fromKey = escapeRegExp(normalizeTextForMatch(fromName));
      const toKey = escapeRegExp(normalizeTextForMatch(toName));

      const rules: Array<{ relationType: NormalizedRelationType; pattern: RegExp }> = [
        { relationType: "depends_on", pattern: new RegExp(`\\b${fromKey}\\b.*\\bdepends on\\b.*\\b${toKey}\\b`) },
        { relationType: "depends_on", pattern: new RegExp(`\\b${fromKey}\\b.*\\bis governed by\\b.*\\b${toKey}\\b`) },
        { relationType: "depends_on", pattern: new RegExp(`\\b${toKey}\\b.*\\bgoverns\\b.*\\b${fromKey}\\b`) },
        { relationType: "depends_on", pattern: new RegExp(`\\b${toKey}\\b.*\\bdefines\\b.*\\b${fromKey}\\b`) },
        { relationType: "supports", pattern: new RegExp(`\\b${fromKey}\\b.*\\bimplies\\b.*\\b${toKey}\\b`) },
        { relationType: "supports", pattern: new RegExp(`\\b${fromKey}\\b.*\\bindicates\\b.*\\b${toKey}\\b`) },
        { relationType: "covers", pattern: new RegExp(`\\b${fromKey}\\b.*\\bapplies to\\b.*\\b${toKey}\\b`) },
        { relationType: "example_of", pattern: new RegExp(`\\b${fromKey}\\b.*\\bis (?:an|a|the)\\b.*\\b${toKey}\\b`) },
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
  existing.sourceClaimIds = uniqueChunkIds([...existing.sourceClaimIds, ...candidate.sourceClaimIds]);
  existing.sourceChunkIds = uniqueChunkIds([...existing.sourceChunkIds, ...candidate.sourceChunkIds]);
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
  const supportStatus = learnerSupportStatus(relatedClaims);
  const definitionClaims = relatedClaims.filter((claim) => /definition|define|means|refers to/i.test(claim.text));
  const formulaClaims = relatedClaims.filter((claim) => /formula|equation|proportional|equals|=|\\frac|\\Delta|\\partial/i.test(claim.text));
  const exampleClaims = relatedClaims.filter((claim) => /example|application|used|appl|case study/i.test(claim.text));
  const misconceptionClaims = relatedClaims.filter((claim) => /not|only|except|unlike|misconception|confus/i.test(claim.text));
  const relationshipClaims = relatedClaims
    .filter((claim) => !definitionClaims.includes(claim) && !formulaClaims.includes(claim))
    .slice(0, 4);

  return [
    `# ${conceptName}`,
    supportStatus ? `\n> ${supportStatus}\n` : "",
    "",
    "## Why it matters",
    bulletList(
      relationshipClaims.slice(0, 2).map((claim) => claim.text),
      `This concept is part of the source's learning path. Use it to connect definitions, examples, and practice problems involving ${conceptName}.`,
    ),
    "",
    "## Definition",
    bulletList(
      definitionClaims.slice(0, 3).map((claim) => claim.text),
      "Still improving — ask the tutor to define this concept from your source.",
    ),
    "",
    "## Intuition",
    bulletList(
      relationshipClaims.slice(0, 2).map((claim) => claim.text),
      "Needs more source support — ask the tutor to build intuition from your selected source.",
    ),
    "",
    "## Formal details",
    bulletList(
      formulaClaims.slice(0, 4).map((claim) => claim.text),
      "Still improving — no formulas or notation have been extracted yet.",
    ),
    "",
    "## Examples",
    bulletList(
      exampleClaims.slice(0, 3).map((claim) => claim.text),
      "Needs more source support — ask the tutor for a worked example.",
    ),
    "",
    "## Common confusions",
    bulletList(
      misconceptionClaims.slice(0, 3).map((claim) => claim.text),
      "No common confusions have been extracted yet.",
    ),
    "",
    "## Source-backed notes",
    bulletList(
      relationshipClaims.map((claim) => claim.text),
      "Needs more source support — open Evidence to inspect excerpts from your source.",
    ),
    "",
    "## Practice prompts",
    `- Explain ${conceptName} in your own words using one source-backed detail.`,
    `- Give one example and one non-example of ${conceptName}.`,
    `- Name one common mistake someone might make with ${conceptName}.`,
    `- Ask the tutor for a worked example involving ${conceptName}.`,
    "",
    "## Fast review checklist",
    `- I can define ${conceptName} without copying the source.`,
    `- I can point to where ${conceptName} appears in the uploaded material.`,
    `- I can use ${conceptName} in a new problem or explanation.`,
    "",
    "## How to use this page",
    "Study these notes, then use tutor chat for teaching, checks, and connections to your current objective.",
    "",
  ].join("\n");
}

export function normalizeSourceSummaryMarkdown(markdown: string, sourceTitle: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return [`# ${sourceTitle}`, "", "## Overview", "Still improving — this source summary will grow as ingestion completes."].join("\n");
  }
  if (/^#\s/m.test(trimmed)) return trimmed;
  return [`# ${sourceTitle}`, "", "## Overview", trimmed].join("\n\n");
}

function topicTitleFromSummaryMarkdown(markdown: string, sourceTitle: string): string {
  const firstHeadingMatch = markdown.match(/^#\s+(.+)$/m) ?? markdown.match(/^##\s+(.+)$/m);
  const heading = firstHeadingMatch?.[1]?.trim() ?? "";
  const sourceStem = sourceTitle.replace(/\.[a-z0-9]+$/i, "").trim();
  if (heading.length === 0) return sourceStem || sourceTitle;
  if (/^(overview|summary|source summary|chapter\s+\d+|lesson\s+\d+)$/i.test(heading) && sourceStem.length > 0) {
    return sourceStem;
  }
  return heading;
}

function buildTopicPageMarkdown(topicTitle: string, sourceSummaryMarkdown: string): string {
  const trimmedSummary = sourceSummaryMarkdown.trim();
  const body = trimmedSummary.replace(/^#\s+.*(?:\r?\n)+/, "").trim();
  return [
    `# ${topicTitle}`,
    "",
    "## Overview",
    body.length > 0 ? body : "Still improving — this topic page will grow as ingestion completes.",
    "",
    "## Study path",
    "- Start with the core definitions and notation.",
    "- Work through one source-backed example before trying practice.",
    "- Use the concept pages under this topic to repair gaps.",
    "",
    "## What to practice",
    "- Explain the topic from memory in three to five sentences.",
    "- Solve or outline one representative problem from the source.",
    "- Ask the tutor to quiz you on the weakest concept in this topic.",
    "",
    "## Common checkpoints",
    "- Can you identify the assumptions used in the source?",
    "- Can you connect this topic to the current curriculum objective?",
    "- Can you state what evidence from the source supports the main claims?",
  ].join("\n");
}

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
    human: input.priorWikiPages.map((p) => ({ pageKey: p.pageKey, blocks: extractHumanBlocks(p.markdown) })),
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
  const maxConceptPages = typeof input.maxConceptPages === "number" && input.maxConceptPages > 0 ? Math.floor(input.maxConceptPages) : null;

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
      const relationType = normalizeRelationType(relation.relationType);
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
          registerConceptLookup(conceptLookup, existingId, [existing.canonicalName, ...mergedAliases, canonicalName]);
        } else {
          registerConceptLookup(conceptLookup, existingId, [existing.canonicalName, ...mergedAliases, canonicalName]);
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

  for (const claim of input.extraction.claims) {
    const claimId = nextId("clm_");
    const ev =
      claim.evidenceChunkId && chunkIdSet.has(claim.evidenceChunkId) ? claim.evidenceChunkId : input.chunkIds[0]!;
    const chunkList = ev ? [ev] : [];
    const hadChunkEvidence = Boolean(claim.evidenceChunkId && chunkIdSet.has(claim.evidenceChunkId));
    const confidenceComponents = {
      sourceSupport: hadChunkEvidence ? 0.76 : 0.58,
      extractionConfidence: 0.68,
      recency: 0.88,
      contradictionPenalty: 0,
      humanApproval: 0,
      reinforcementSignal: reinforcementSignalFromCount(0),
    };
    const linkedConceptIds = claim.conceptNames
      .map((cn) => resolveConceptId(conceptLookup, cn.trim()) ?? conceptIdByName.get(cn.trim()) ?? null)
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

  const insertedClaimMeta = rawClaims.map((c) => ({
    id: c.id,
    text: c.claimText,
    conceptIds: c.conceptIds,
    chunkIds: c.evidenceChunkIds,
    confidence: combineConfidence(c.confidenceComponents),
    confidenceComponents: c.confidenceComponents,
  }));

  const relationCandidates = new Map<string, ConceptRelationCandidate>();
  for (const rel of normalizedRelations) {
    const fromId = resolveConceptId(conceptLookup, rel.fromConcept.trim()) ?? conceptIdByName.get(rel.fromConcept.trim());
    const toId = resolveConceptId(conceptLookup, rel.toConcept.trim()) ?? conceptIdByName.get(rel.toConcept.trim());
    if (!fromId || !toId || fromId === toId) continue;
    upsertConceptRelationCandidate(relationCandidates, {
      fromId,
      toId,
      relationType: rel.relationType,
      confidence: rel.confidence ?? 0.72,
      sourceClaimIds: [],
      sourceChunkIds: [],
    });
  }

  for (const relation of inferConceptRelationsFromClaims(insertedClaimMeta, conceptNamesById)) {
    upsertConceptRelationCandidate(relationCandidates, relation);
  }

  const conceptGraphRelations: WikiChangeSetGraphRelation[] = [...relationCandidates.values()].map((relation) => ({
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
  }));

  const contradictionEdges = normalizedRelations
    .filter((r) => r.relationType === "contradicts")
    .map((r) => {
      const fromConceptId =
        resolveConceptId(conceptLookup, r.fromConcept.trim()) ?? conceptIdByName.get(r.fromConcept.trim());
      const toConceptId = resolveConceptId(conceptLookup, r.toConcept.trim()) ?? conceptIdByName.get(r.toConcept.trim());
      if (!fromConceptId || !toConceptId) return null;
      return { fromConceptId, toConceptId };
    })
    .filter(Boolean) as Array<{ fromConceptId: string; toConceptId: string }>;

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
  const sourceSummaryAgentMd = normalizeSourceSummaryMarkdown(input.extraction.sourceSummaryMarkdown, input.sourceTitle);
  const sourceSummaryMerged = mergeAgentMarkdownWithHumanBlocks(sourceSummaryAgentMd, humanBlocksByPageKey.get(sourceSummaryPageKey) ?? []);
  const topicTitle = topicTitleFromSummaryMarkdown(sourceSummaryAgentMd, input.sourceTitle);
  const topicPageKey = `topic:${input.sourceId}`;
  const topicAgentMd = buildTopicPageMarkdown(topicTitle, sourceSummaryAgentMd);
  const topicPageMerged = mergeAgentMarkdownWithHumanBlocks(topicAgentMd, humanBlocksByPageKey.get(topicPageKey) ?? []);

  const conceptRanking = input.extraction.concepts
    .map((concept, index) => ({
      concept,
      index,
      relatedClaims: insertedClaimMeta.filter((claim) => claim.conceptIds.includes(resolveConceptId(conceptLookup, concept.name.trim()) ?? conceptIdByName.get(concept.name.trim()) ?? "")),
    }))
    .sort((left, right) => {
      if (right.relatedClaims.length !== left.relatedClaims.length) return right.relatedClaims.length - left.relatedClaims.length;
      return left.index - right.index;
    });
  const selectedConcepts = maxConceptPages ? conceptRanking.slice(0, maxConceptPages) : conceptRanking;
  const selectedConceptIds = new Set(
    selectedConcepts
      .map(({ concept }) => resolveConceptId(conceptLookup, concept.name.trim()) ?? conceptIdByName.get(concept.name.trim()) ?? null)
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

  const deleteWikiPageKeys = input.priorWikiPages
    .filter((p) => p.pageType === "concept" || p.pageType === "topic")
    .filter((p) => {
      if (p.pageType === "topic") return p.pageKey === topicPageKey;
      const conceptId = p.pageKey.startsWith("concept:") ? p.pageKey.slice("concept:".length) : null;
      return !maxConceptPages || !conceptId || selectedConceptIds.has(conceptId);
    })
    .map((p) => p.pageKey);

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
      structuredJson: { sourceId: input.sourceId, sourceVersionId: input.sourceVersionId, bootstrapSourceId: input.sourceId, topicTitle },
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
      blocks: pageBlocksFromMarkdown(sourceSummaryAgentMd, humanBlocksByPageKey.get(sourceSummaryPageKey) ?? []),
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
    const conceptPageKey = `concept:${cid}`;
    const humanBlocks = humanBlocksByPageKey.get(conceptPageKey) ?? [];
    const agentMd = buildConceptPageMarkdown(concept.name.trim(), relatedClaims);
    const merged = mergeAgentMarkdownWithHumanBlocks(agentMd, humanBlocks);
    const conceptPageId = nextId("wp_");
    wikiPages.push({
      id: conceptPageId,
      pageType: "concept",
      pageKey: conceptPageKey,
      title: `Concept · ${concept.name.trim()}`,
      markdown: merged,
      blocks: pageBlocksFromMarkdown(agentMd, humanBlocks),
      sourceClaimIds: relatedClaims.map((m) => m.id),
      sourceChunkIds: uniqueChunkIds(relatedClaims.flatMap((m) => m.chunkIds)),
      structuredJson: { conceptId: cid, bootstrapSourceId: input.sourceId },
      confidenceSummaryJson: {
        ...buildPageConfidenceSummary({
          claimConfidences: relatedClaims.map((m) => m.confidence),
          claimComponentSamples: relatedClaims.map((m) => m.confidenceComponents),
        }),
      },
      qualityScore: 0.65,
    });
    events.push({
      eventType: "wiki.page.compiled",
      payload: { pageId: conceptPageId, pageType: "concept", pageKey: conceptPageKey, conceptId: cid },
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
