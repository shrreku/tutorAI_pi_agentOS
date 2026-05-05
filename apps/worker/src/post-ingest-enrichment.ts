import type { StudyAgentEnv } from "@studyagent/config";
import type { DbClient } from "@studyagent/db";
import {
  appendEvent,
  coverageItems,
  coverageRecords,
  claimConceptLinks,
  claims,
  concepts,
  curricula,
  curriculumModules,
  graphRelations,
  objectiveLists,
  notebooks,
  objectives,
  sessionPlans,
  studyPlans,
  wikiPages,
} from "@studyagent/db";
import {
  createNeo4jDriver,
  mergeCoverageItemNode,
  mergeCoverageRecordNode,
  mergeCurriculumModuleNode,
  mergeObjectiveListNode,
  linkSourceCoversCurriculum,
  mergeClaimContradiction,
  mergeClaimNode,
  mergeClaimSupersedes,
  mergeConceptNodes,
  mergeConceptRelation,
  mergeCurriculumNode,
  mergeObjectiveNode,
  mergeSessionPlanNode,
  mergeSourceNode,
  mergeStudyPlanAndObjectives,
  mergeWikiPageForSource,
  mergeWikiPageNode,
  verifyNeo4jProjection,
  type IngestConceptRelationKind,
} from "@studyagent/graph";
import {
  buildPageConfidenceSummary,
  combineConfidence,
  extractHumanBlocks,
  lintNotebookWiki,
  mergeAgentMarkdownWithHumanBlocks,
  normalizeClaimText,
  pickContradictionClaimPairs,
  planCrossSourceSupersessions,
  reinforcementSignalFromCount,
  type ClaimLite,
} from "@studyagent/wiki-core";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

const relationTypeSchema = z.enum(["depends_on", "supports", "example_of", "contradicts", "covers"]);
type NormalizedRelationType = z.infer<typeof relationTypeSchema>;

const extractionSchema = z.object({
  concepts: z
    .array(
      z.object({
        name: z.string().min(1),
        conceptType: z.string().optional(),
        aliases: z.array(z.string()).optional(),
      }),
    )
    .max(24),
  claims: z
    .array(
      z.object({
        claimText: z.string().min(1),
        claimType: z.string().optional(),
        conceptNames: z.array(z.string()).default([]),
        evidenceChunkId: z.string().optional(),
      }),
    )
    .max(30),
  relations: z
    .array(
      z.object({
        fromConcept: z.string().min(1),
        toConcept: z.string().min(1),
        relationType: z.string().min(1),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .max(40)
    .optional()
    .default([]),
  sourceSummaryMarkdown: z.string().min(1),
  curriculumTitle: z.string().optional(),
});

const focusedRelationSchema = z.object({
  relations: z
    .array(
      z.object({
        fromConcept: z.string().min(1),
        toConcept: z.string().min(1),
        relationType: z.string().min(1),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .max(40)
    .default([]),
});

type ConceptRelationCandidate = {
  fromId: string;
  toId: string;
  relationType: NormalizedRelationType;
  confidence: number;
  sourceClaimIds: string[];
  sourceChunkIds: string[];
};

export type EnrichmentInput = {
  notebookId: string;
  sourceId: string;
  sourceVersionId: string;
  sourceTitle: string;
  chunks: Array<{ id: string; text: string }>;
};

function trimCorpus(chunks: Array<{ id: string; text: string }>, maxChars: number): string {
  const parts: string[] = [];
  let n = 0;
  for (const c of chunks) {
    const block = `[${c.id}]\n${c.text}`;
    if (n + block.length > maxChars) break;
    parts.push(block);
    n += block.length + 2;
  }
  return parts.join("\n\n");
}

function uniqueChunkIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function mergeAliases(existing: string[], incoming: string[]): string[] {
  const out = new Set<string>();
  for (const alias of [...existing, ...incoming]) {
    const trimmed = alias.trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  return [...out];
}

function singularizeToken(token: string): string {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
  return token;
}

function normalizeConceptKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conceptKeyVariants(value: string): string[] {
  const base = normalizeConceptKey(value);
  if (!base) return [];
  const singular = base
    .split(" ")
    .map((token) => singularizeToken(token))
    .join(" ")
    .trim();
  return [...new Set([base, singular].filter(Boolean))];
}

function registerConceptLookup(map: Map<string, string>, conceptId: string, names: string[]): void {
  for (const name of names) {
    for (const variant of conceptKeyVariants(name)) {
      map.set(variant, conceptId);
    }
  }
}

function resolveConceptId(map: Map<string, string>, rawName: string): string | null {
  for (const variant of conceptKeyVariants(rawName)) {
    const id = map.get(variant);
    if (id) return id;
  }
  return null;
}

function normalizeRelationType(value: string): NormalizedRelationType | null {
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

async function openRouterJsonObject(
  env: StudyAgentEnv,
  system: string,
  user: string,
): Promise<unknown> {
  const base = env.OPENROUTER_BASE_URL.replace(/\/+$/, "");
  const model = env.DEFAULT_EXTRACTION_MODEL;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY!}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(`OpenRouter chat failed (${res.status}): ${body?.error?.message ?? JSON.stringify(body).slice(0, 400)}`);
  }
  const text = body.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenRouter chat: empty message content");
  }
  return JSON.parse(text) as unknown;
}

async function extractFocusedRelations(
  env: StudyAgentEnv,
  concepts: Array<{ name: string; aliases?: string[] }>,
  claimsList: Array<{ claimText: string; conceptNames: string[] }>,
): Promise<z.infer<typeof focusedRelationSchema>["relations"]> {
  if (concepts.length < 2 || claimsList.length === 0) {
    return [];
  }

  const system = [
    "You extract only concept-to-concept relations for a study notebook.",
    "Return ONLY a JSON object with one key: relations.",
    "Each relation must be { fromConcept, toConcept, relationType, confidence? }.",
    "Use only exact concept names from the provided concept list.",
    "Prefer direct durable links that are clearly supported by the claims.",
    "Do not invent relations if the evidence is weak.",
    "Allowed relationType values: depends_on, supports, example_of, contradicts, covers.",
  ].join("\n");

  const user = [
    "Concepts:",
    ...concepts.map((concept) =>
      `- ${concept.name}${concept.aliases?.length ? ` (aliases: ${concept.aliases.join(", ")})` : ""}`,
    ),
    "",
    "Claims:",
    ...claimsList.map((claim) => `- ${claim.claimText} [concepts: ${claim.conceptNames.join(", ")}]`),
  ].join("\n");

  try {
    const raw = await openRouterJsonObject(env, system, user);
    return focusedRelationSchema.parse(raw).relations;
  } catch {
    return [];
  }
}

export async function runPostIngestEnrichment(
  env: StudyAgentEnv,
  dbClient: DbClient,
  input: EnrichmentInput,
): Promise<{ ok: boolean; reason?: string }> {
  if (!env.OPENROUTER_API_KEY) {
    return { ok: false, reason: "OPENROUTER_API_KEY not set" };
  }

  if (input.chunks.length === 0) {
    return { ok: false, reason: "no_retrieval_chunks" };
  }

  const system = [
    "You extract durable learning objects for a personal notebook.",
    "Return ONLY a single JSON object (no markdown fences) with keys:",
    "- concepts: array of { name, conceptType?, aliases? }",
    "- claims: array of { claimText, claimType?, conceptNames, evidenceChunkId? }",
    "- relations?: array of { fromConcept, toConcept, relationType, confidence? }",
    "- sourceSummaryMarkdown: string (short markdown overview of the source)",
    "- curriculumTitle?: string",
    "Prefer canonical noun phrases for concepts and avoid near-duplicate concepts when one concept can be expressed as an alias of another.",
    "Prefer 'Phenomenological Law' over shortened forms like 'Phenomenological' when the law itself is the concept.",
    "relationType must be one of: depends_on, supports, example_of, contradicts, covers.",
    "relations must use concept names from your concepts list (exact strings).",
    "Each claim must cite evidenceChunkId using one of the chunk ids from the evidence section when possible.",
    "conceptNames on claims must reference concept names you listed in concepts (or close variants).",
  ].join("\n");

  const user = [
    `Source title: ${input.sourceTitle}`,
    "### Evidence chunks (use ids verbatim for evidenceChunkId)",
    trimCorpus(input.chunks, 28_000),
  ].join("\n\n");

  let parsed: z.infer<typeof extractionSchema>;
  try {
    const raw = await openRouterJsonObject(env, system, user);
    parsed = extractionSchema.parse(raw);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  const focusedRelations = await extractFocusedRelations(
    env,
    parsed.concepts.map((concept) => ({
      name: concept.name.trim(),
      ...(concept.aliases ? { aliases: concept.aliases } : {}),
    })),
    parsed.claims.map((claim) => ({ claimText: claim.claimText.trim(), conceptNames: claim.conceptNames })),
  );

  const normalizedRelations = [...parsed.relations, ...focusedRelations]
    .map((relation) => {
      const relationType = normalizeRelationType(relation.relationType);
      if (!relationType) {
        return null;
      }
      return {
        ...relation,
        relationType,
      };
    })
    .filter(Boolean) as Array<{
    fromConcept: string;
    toConcept: string;
    relationType: NormalizedRelationType;
    confidence?: number;
  }>;

  const now = new Date();
  const chunkIds = new Set(input.chunks.map((c) => c.id));

  await dbClient.db.delete(claims).where(eq(claims.sourceId, input.sourceId));
  await dbClient.db
    .delete(graphRelations)
    .where(
      and(
        eq(graphRelations.notebookId, input.notebookId),
        sql`(${graphRelations.metadataJson}->>'ingestionSourceId') = ${input.sourceId}`,
      ),
    );

  const conceptIdByName = new Map<string, string>();
  const conceptLookup = new Map<string, string>();

  const existingConcepts = await dbClient.db
    .select()
    .from(concepts)
    .where(eq(concepts.notebookId, input.notebookId));

  const conceptsById = new Map(existingConcepts.map((concept) => [concept.id, concept]));
  for (const concept of existingConcepts) {
    registerConceptLookup(conceptLookup, concept.id, [concept.canonicalName, ...(concept.aliases ?? [])]);
  }

  for (const c of parsed.concepts) {
    const canonicalName = c.name.trim();
    const incomingAliases = mergeAliases([], c.aliases ?? []);
    const existingId = resolveConceptId(conceptLookup, canonicalName);
    if (existingId) {
      conceptIdByName.set(canonicalName, existingId);
      const existing = conceptsById.get(existingId);
      if (existing) {
        const mergedAliases = mergeAliases(existing.aliases ?? [], incomingAliases);
        if (mergedAliases.length !== (existing.aliases ?? []).length) {
          await dbClient.db.update(concepts).set({ aliases: mergedAliases, updatedAt: now }).where(eq(concepts.id, existingId));
          const updated = { ...existing, aliases: mergedAliases };
          conceptsById.set(existingId, updated);
          registerConceptLookup(conceptLookup, existingId, [updated.canonicalName, ...mergedAliases, canonicalName]);
        } else {
          registerConceptLookup(conceptLookup, existingId, [existing.canonicalName, ...mergedAliases, canonicalName]);
        }
      }
      continue;
    }
    const id = `cnc_${crypto.randomUUID().replaceAll("-", "")}`;
    conceptIdByName.set(canonicalName, id);
    registerConceptLookup(conceptLookup, id, [canonicalName, ...incomingAliases]);
    await dbClient.db.insert(concepts).values({
      id,
      notebookId: input.notebookId,
      canonicalName,
      aliases: incomingAliases,
      conceptType: c.conceptType ?? "term",
      description: null,
      confidence: 0.75,
      metadataJson: { ingestionSourceId: input.sourceId },
      createdAt: now,
      updatedAt: now,
    });
    conceptsById.set(id, {
      id,
      notebookId: input.notebookId,
      canonicalName,
      aliases: incomingAliases,
      conceptType: c.conceptType ?? "term",
      description: null,
      confidence: 0.75,
      metadataJson: { ingestionSourceId: input.sourceId },
      createdAt: now,
      updatedAt: now,
    });
  }

  const conceptNamesById = new Map([...conceptsById.values()].map((concept) => [concept.id, concept.canonicalName]));

  const insertedClaimMeta: Array<{
    id: string;
    text: string;
    conceptIds: string[];
    chunkIds: string[];
    confidence: number;
    confidenceComponents: {
      sourceSupport: number;
      extractionConfidence: number;
      recency: number;
      contradictionPenalty: number;
      humanApproval: number;
      reinforcementSignal: number;
    };
  }> = [];

  for (const cl of parsed.claims) {
    const claimId = `clm_${crypto.randomUUID().replaceAll("-", "")}`;
    const ev = cl.evidenceChunkId && chunkIds.has(cl.evidenceChunkId) ? cl.evidenceChunkId : input.chunks[0]!.id;
    const chunkList = ev ? [ev] : [];

    const hadChunkEvidence = Boolean(cl.evidenceChunkId && chunkIds.has(cl.evidenceChunkId));
    const confComponents = {
      sourceSupport: hadChunkEvidence ? 0.76 : 0.58,
      extractionConfidence: 0.68,
      recency: 0.88,
      contradictionPenalty: 0,
      humanApproval: 0,
      reinforcementSignal: reinforcementSignalFromCount(0),
    };
    const confidence = combineConfidence(confComponents);

    await dbClient.db.insert(claims).values({
      id: claimId,
      notebookId: input.notebookId,
      sourceId: input.sourceId,
      sourceVersionId: input.sourceVersionId,
      claimType: cl.claimType ?? "fact",
      claimText: cl.claimText.trim(),
      status: "candidate",
      confidence,
      qualityScore: confidence,
      supportScore: confComponents.sourceSupport,
      confidenceComponentsJson: confComponents,
      sourceSpanJson: { evidenceChunkId: ev },
      sourceChunkIds: chunkList,
      metadataJson: {},
      createdAt: now,
      updatedAt: now,
    });

    const linkedConceptIds = cl.conceptNames
      .map((cn) => resolveConceptId(conceptLookup, cn.trim()) ?? conceptIdByName.get(cn.trim()) ?? null)
      .filter(Boolean) as string[];
    insertedClaimMeta.push({
      id: claimId,
      text: cl.claimText.trim(),
      conceptIds: linkedConceptIds,
      chunkIds: chunkList,
      confidence,
      confidenceComponents: confComponents,
    });

    for (const cn of cl.conceptNames) {
      const cid = resolveConceptId(conceptLookup, cn.trim()) ?? conceptIdByName.get(cn.trim());
      if (!cid) continue;
      await dbClient.db.insert(claimConceptLinks).values({
        claimId,
        conceptId: cid,
        role: "subject",
        confidence,
      });
    }
  }

  const relationCandidates = new Map<string, ConceptRelationCandidate>();
  for (const rel of normalizedRelations) {
    const fromId = resolveConceptId(conceptLookup, rel.fromConcept.trim()) ?? conceptIdByName.get(rel.fromConcept.trim());
    const toId = resolveConceptId(conceptLookup, rel.toConcept.trim()) ?? conceptIdByName.get(rel.toConcept.trim());
    if (!fromId || !toId || fromId === toId) {
      continue;
    }
    upsertConceptRelationCandidate(relationCandidates, {
      fromId,
      toId,
      relationType: rel.relationType,
      confidence: rel.confidence ?? 0.72,
      sourceClaimIds: [],
      sourceChunkIds: [],
    });
  }

  const heuristicRelations = inferConceptRelationsFromClaims(
    insertedClaimMeta.map((claim) => ({
      id: claim.id,
      text: claim.text,
      conceptIds: claim.conceptIds,
      chunkIds: claim.chunkIds,
    })),
    conceptNamesById,
  );
  for (const relation of heuristicRelations) {
    upsertConceptRelationCandidate(relationCandidates, relation);
  }

  for (const relation of relationCandidates.values()) {
    const gid = `gre_${crypto.randomUUID().replaceAll("-", "")}`;
    await dbClient.db.insert(graphRelations).values({
      id: gid,
      notebookId: input.notebookId,
      sourceNodeType: "concept",
      sourceNodeId: relation.fromId,
      targetNodeType: "concept",
      targetNodeId: relation.toId,
      relationType: relation.relationType,
      confidence: relation.confidence,
      sourceClaimIds: relation.sourceClaimIds,
      sourceChunkIds: relation.sourceChunkIds,
      metadataJson: { ingestionSourceId: input.sourceId },
    });
  }

  const excludedClaimStatuses = ["superseded", "deprecated", "archived"] as const;
  const existingClaimsRows = await dbClient.db
    .select({
      id: claims.id,
      sourceId: claims.sourceId,
      claimText: claims.claimText,
      createdAt: claims.createdAt,
    })
    .from(claims)
    .where(
      and(
        eq(claims.notebookId, input.notebookId),
        ne(claims.sourceId, input.sourceId),
        notInArray(claims.status, [...excludedClaimStatuses]),
      ),
    );

  const existingLites: ClaimLite[] = existingClaimsRows.map((c) => ({
    id: c.id,
    sourceId: c.sourceId,
    normalized: normalizeClaimText(c.claimText),
    createdAtMs: c.createdAt.getTime(),
  }));

  const newLites: ClaimLite[] = insertedClaimMeta.map((m) => ({
    id: m.id,
    sourceId: input.sourceId,
    normalized: normalizeClaimText(m.text),
    createdAtMs: now.getTime(),
  }));

  const supersedePlans = planCrossSourceSupersessions(newLites, existingLites);
  for (const p of supersedePlans) {
    await dbClient.db
      .update(claims)
      .set({ status: "superseded", supersededByClaimId: p.winnerId, updatedAt: now })
      .where(eq(claims.id, p.olderId));
    await dbClient.db.insert(graphRelations).values({
      id: `gre_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: input.notebookId,
      sourceNodeType: "claim",
      sourceNodeId: p.winnerId,
      targetNodeType: "claim",
      targetNodeId: p.olderId,
      relationType: "supersedes",
      confidence: 0.9,
      sourceClaimIds: [p.winnerId, p.olderId],
      sourceChunkIds: [],
      metadataJson: { wikiLifecycle: "supersedes", ingestionSourceId: input.sourceId },
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "wiki.claim.superseded",
      payload: { loserClaimId: p.olderId, winnerClaimId: p.winnerId },
    });
  }

  const contradictRels = normalizedRelations
    .map((r) => {
      if (r.relationType !== "contradicts") return null;
      const fromConceptId =
        resolveConceptId(conceptLookup, r.fromConcept.trim()) ?? conceptIdByName.get(r.fromConcept.trim());
      const toConceptId = resolveConceptId(conceptLookup, r.toConcept.trim()) ?? conceptIdByName.get(r.toConcept.trim());
      if (!fromConceptId || !toConceptId) return null;
      return { fromConceptId, toConceptId, relationType: "contradicts" as const };
    })
    .filter(Boolean) as Array<{ fromConceptId: string; toConceptId: string; relationType: "contradicts" }>;

  const contradictionPairs = pickContradictionClaimPairs({
    relations: contradictRels,
    claims: insertedClaimMeta.map((m) => ({ id: m.id, conceptIds: m.conceptIds })),
  });

  for (const pair of contradictionPairs) {
    const a = pair.a;
    const b = pair.b;
    await dbClient.db.insert(graphRelations).values({
      id: `gre_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: input.notebookId,
      sourceNodeType: "claim",
      sourceNodeId: a,
      targetNodeType: "claim",
      targetNodeId: b,
      relationType: "contradicts",
      confidence: 0.65,
      sourceClaimIds: [a, b],
      sourceChunkIds: [],
      metadataJson: { wikiLifecycle: "claim_contradiction", ingestionSourceId: input.sourceId },
    });

    for (const cid of [a, b]) {
      const [row] = await dbClient.db.select().from(claims).where(eq(claims.id, cid)).limit(1);
      if (!row || row.status === "superseded") continue;
      const prev = (row.confidenceComponentsJson ?? {}) as Record<string, unknown>;
      const components = {
        sourceSupport: Number(prev.sourceSupport ?? 0.72),
        extractionConfidence: Number(prev.extractionConfidence ?? 0.68),
        recency: Number(prev.recency ?? 0.88),
        humanApproval: Number(prev.humanApproval ?? 0),
        reinforcementSignal: Number(prev.reinforcementSignal ?? 0),
        contradictionPenalty: Math.min(1, Number(prev.contradictionPenalty ?? 0) + 0.35),
      };
      const confidence = combineConfidence(components);
      await dbClient.db
        .update(claims)
        .set({
          status: "contradicted",
          confidence,
          qualityScore: confidence,
          confidenceComponentsJson: components,
          updatedAt: now,
        })
        .where(eq(claims.id, cid));
    }

    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "wiki.claim.contradicted",
      payload: { claimIds: [a, b] },
    });
  }

  const sourceSummaryPageKey = `source:${input.sourceId}`;
  const priorConceptPages = await dbClient.db
    .select()
    .from(wikiPages)
    .where(
      and(
        eq(wikiPages.notebookId, input.notebookId),
        eq(wikiPages.pageType, "concept"),
        sql`(${wikiPages.structuredJson}->>'bootstrapSourceId') = ${input.sourceId}`,
      ),
    );

  const [priorSummary] = await dbClient.db
    .select()
    .from(wikiPages)
    .where(
      and(
        eq(wikiPages.notebookId, input.notebookId),
        eq(wikiPages.pageType, "source_summary"),
        eq(wikiPages.pageKey, sourceSummaryPageKey),
      ),
    )
    .limit(1);

  const humanBlocksByConceptPageKey = new Map<string, ReturnType<typeof extractHumanBlocks>>();
  for (const row of priorConceptPages) {
    humanBlocksByConceptPageKey.set(row.pageKey, extractHumanBlocks(row.markdown));
  }
  const humanBlocksSourceSummary = priorSummary ? extractHumanBlocks(priorSummary.markdown) : [];

  await dbClient.db
    .delete(wikiPages)
    .where(
      and(
        eq(wikiPages.notebookId, input.notebookId),
        eq(wikiPages.pageType, "concept"),
        sql`(${wikiPages.structuredJson}->>'bootstrapSourceId') = ${input.sourceId}`,
      ),
    );

  const [nb] = await dbClient.db.select().from(notebooks).where(eq(notebooks.id, input.notebookId)).limit(1);
  if (!nb) {
    return { ok: false, reason: "notebook_missing" };
  }

  const pageKey = sourceSummaryPageKey;
  const pageId = `wp_${crypto.randomUUID().replaceAll("-", "")}`;
  const sourceSummaryChunkIds = uniqueChunkIds(insertedClaimMeta.flatMap((m) => m.chunkIds));

  await dbClient.db
    .delete(wikiPages)
    .where(
      and(
        eq(wikiPages.notebookId, input.notebookId),
        eq(wikiPages.pageType, "source_summary"),
        eq(wikiPages.pageKey, pageKey),
      ),
    );

  await dbClient.db.insert(wikiPages).values({
    id: pageId,
    notebookId: input.notebookId,
    pageType: "source_summary",
    pageKey,
    title: `Source · ${input.sourceTitle}`,
    version: 1,
    status: "draft",
    structuredJson: { sourceId: input.sourceId, sourceVersionId: input.sourceVersionId },
    markdown: mergeAgentMarkdownWithHumanBlocks(parsed.sourceSummaryMarkdown, humanBlocksSourceSummary),
    sourceClaimIds: insertedClaimMeta.map((m) => m.id),
    sourceChunkIds: sourceSummaryChunkIds.length ? sourceSummaryChunkIds : input.chunks.map((c) => c.id),
    confidenceSummaryJson: {
      ...buildPageConfidenceSummary({
        claimConfidences: insertedClaimMeta.map((m) => m.confidence),
        claimComponentSamples: insertedClaimMeta.map((m) => m.confidenceComponents),
      }),
      extractionModel: env.DEFAULT_EXTRACTION_MODEL,
    },
    qualityScore: 0.7,
    createdAt: now,
    updatedAt: now,
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "wiki.page.compiled",
    payload: { pageId, pageType: "source_summary", pageKey, sourceId: input.sourceId },
  });

  for (const c of parsed.concepts) {
    const cid = conceptIdByName.get(c.name.trim());
    if (!cid) continue;
    const relatedClaims = insertedClaimMeta.filter((m) => m.conceptIds.includes(cid));
    const bullets =
      relatedClaims.length > 0
        ? relatedClaims.map((m) => `- ${m.text} _(claim \`${m.id}\`)_`).join("\n")
        : "_No extracted claims linked to this concept yet._";
    const conceptChunkIds = uniqueChunkIds(relatedClaims.flatMap((m) => m.chunkIds));
    const conceptMdBase = `## ${c.name.trim()}\n\n${bullets}\n`;
    const conceptPageKey = `concept:${cid}`;
    const conceptMd = mergeAgentMarkdownWithHumanBlocks(
      conceptMdBase,
      humanBlocksByConceptPageKey.get(conceptPageKey) ?? [],
    );
    const conceptPageId = `wp_${crypto.randomUUID().replaceAll("-", "")}`;
    await dbClient.db.insert(wikiPages).values({
      id: conceptPageId,
      notebookId: input.notebookId,
      pageType: "concept",
      pageKey: conceptPageKey,
      title: `Concept · ${c.name.trim()}`,
      version: 1,
      status: "draft",
      structuredJson: { conceptId: cid, bootstrapSourceId: input.sourceId },
      markdown: conceptMd,
      sourceClaimIds: relatedClaims.map((m) => m.id),
      sourceChunkIds: conceptChunkIds,
      confidenceSummaryJson: {
        ...buildPageConfidenceSummary({
          claimConfidences: relatedClaims.map((m) => m.confidence),
          claimComponentSamples: relatedClaims.map((m) => m.confidenceComponents),
        }),
        extractionModel: env.DEFAULT_EXTRACTION_MODEL,
      },
      qualityScore: 0.65,
      createdAt: now,
      updatedAt: now,
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "wiki.page.compiled",
      payload: { pageId: conceptPageId, pageType: "concept", pageKey: conceptPageKey, conceptId: cid },
    });
  }

  const [existingPlan] = await dbClient.db
    .select()
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, input.notebookId), eq(studyPlans.userId, nb.ownerId)))
    .limit(1);

  let curriculumId: string | undefined;
  let moduleId: string | undefined;
  let objectiveListId: string | undefined;
  let sessionPlanId: string | undefined;
  let objectiveIdsOrdered: string[] = [];
  let coverageProjectionItems: Array<{ itemId: string; recordId: string; title: string; itemFamily: string; status: string }> = [];
  let planId: string | undefined;
  let currentObjectiveId: string | undefined;

  if (!existingPlan) {
    curriculumId = `cur_${crypto.randomUUID().replaceAll("-", "")}`;
    await dbClient.db.insert(curricula).values({
      id: curriculumId,
      notebookId: input.notebookId,
      title: parsed.curriculumTitle ?? `Learning track · ${input.sourceTitle}`,
      curriculumType: "from_sources",
      scopeJson: { sourceIds: [input.sourceId] },
      status: "draft",
      sourceIds: [input.sourceId],
      coverageSummaryJson: { conceptCount: parsed.concepts.length, claimCount: parsed.claims.length },
      confidence: 0.65,
      createdAt: now,
      updatedAt: now,
    });

    const objectiveIds: string[] = [];
    const objectiveTitles = ["Orient and skim the source", "Solidify core terms", "Apply ideas with self-check"];
    const seedConceptIds = parsed.concepts
      .map((c) => conceptIdByName.get(c.name.trim()))
      .filter(Boolean) as string[];

    moduleId = `mod_${crypto.randomUUID().replaceAll("-", "")}`;
    objectiveListId = `objlist_${crypto.randomUUID().replaceAll("-", "")}`;
    sessionPlanId = `sessplan_${crypto.randomUUID().replaceAll("-", "")}`;

    for (let i = 0; i < objectiveTitles.length; i += 1) {
      const oid = `obj_${crypto.randomUUID().replaceAll("-", "")}`;
      objectiveIds.push(oid);
      await dbClient.db.insert(objectives).values({
        id: oid,
        notebookId: input.notebookId,
        curriculumId: curriculumId!,
        title: objectiveTitles[i]!,
        status: "not_started",
        orderIndex: i,
        prerequisiteConceptIds: [],
        targetConceptIds: i === 0 ? seedConceptIds.slice(0, 5) : [],
        successCriteriaJson: { minClaimsReviewed: Math.min(3, parsed.claims.length) },
        sourceRefsJson: [{ sourceId: input.sourceId }],
        suggestedMode: "explore",
        readinessScore: 0.6,
        createdAt: now,
        updatedAt: now,
      });
    }

    await dbClient.db.insert(curriculumModules).values({
      id: moduleId,
      notebookId: input.notebookId,
      curriculumId,
      title: `${parsed.curriculumTitle ?? `Learning track · ${input.sourceTitle}`}`,
      summary: `Bootstrap module generated from ${input.sourceTitle}`,
      orderIndex: 0,
      status: "active",
      sourceRefsJson: [{ sourceId: input.sourceId }],
      targetConceptIds: seedConceptIds.slice(0, 8),
      prerequisiteModuleIds: [],
      estimatedSessionCount: 3,
      coverageRequirementsJson: { conceptCount: Math.max(3, seedConceptIds.length), claimCount: Math.min(5, parsed.claims.length) },
      masteryGateJson: { minObjectivesCompleted: 2 },
      createdAt: now,
      updatedAt: now,
    });

    await dbClient.db.insert(objectiveLists).values({
      id: objectiveListId,
      notebookId: input.notebookId,
      curriculumId,
      moduleId,
      title: "Active objective list",
      status: "active",
      currentObjectiveId: objectiveIds[0] ?? null,
      objectiveIdsOrdered: objectiveIds,
      coverageSnapshotJson: { sourceId: input.sourceId, objectiveCount: objectiveIds.length },
      createdByRunId: null,
      createdAt: now,
      updatedAt: now,
    });

    await dbClient.db.insert(sessionPlans).values({
      id: sessionPlanId,
      notebookId: input.notebookId,
      curriculumId,
      moduleId,
      objectiveListId,
      title: "Current teaching session",
      status: "active",
      sessionGoal: `Learn the essentials of ${input.sourceTitle}`,
      plannedObjectiveIds: objectiveIds,
      openerJson: { mode: "bootstrap" },
      diagnosticQuestionIds: [],
      teachingArcIds: [],
      artifactRefsJson: [],
      exitCriteriaJson: { minObjectivesAddressed: 1 },
      recommendationReasonJson: { reason: "bootstrap_after_ingestion" },
      createdByRunId: null,
      createdAt: now,
      updatedAt: now,
    });

    const coverageSeedItems = [
      ...seedConceptIds.map((conceptId) => ({
        itemFamily: "concept",
        title: `Concept coverage: ${conceptId}`,
        conceptId,
        claimId: null as string | null,
      })),
      ...parsed.claims.slice(0, 5).map((claim) => ({
        itemFamily: "claim",
        title: claim.claimText.slice(0, 120),
        conceptId: null as string | null,
        claimId: null as string | null,
      })),
    ];

    for (const item of coverageSeedItems) {
      const coverageItemId = `cov_${crypto.randomUUID().replaceAll("-", "")}`;
      const coverageRecordId = `covrec_${crypto.randomUUID().replaceAll("-", "")}`;
      coverageProjectionItems.push({ itemId: coverageItemId, recordId: coverageRecordId, title: item.title, itemFamily: item.itemFamily, status: "planned" });
      await dbClient.db.insert(coverageItems).values({
        id: coverageItemId,
        notebookId: input.notebookId,
        sourceId: input.sourceId,
        sourceVersionId: input.sourceVersionId,
        itemFamily: item.itemFamily,
        title: item.title,
        description: null,
        conceptId: item.conceptId,
        claimId: item.claimId,
        sourceRefsJson: [{ sourceId: input.sourceId }],
        metadataJson: { seededBy: "post_ingest_bootstrap" },
        createdAt: now,
        updatedAt: now,
      });

      await dbClient.db.insert(coverageRecords).values({
        id: coverageRecordId,
        notebookId: input.notebookId,
        coverageItemId,
        curriculumId,
        moduleId,
        objectiveListId,
        sessionPlanId,
        status: "planned",
        evidenceJson: { sourceId: input.sourceId },
        updatedByRunId: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    planId = `spl_${crypto.randomUUID().replaceAll("-", "")}`;
    const current = objectiveIds[0]!;
    const upcoming = objectiveIds.slice(1);
    objectiveIdsOrdered = objectiveIds;
    currentObjectiveId = current;

    await dbClient.db.insert(studyPlans).values({
      id: planId,
      notebookId: input.notebookId,
      userId: nb.ownerId,
      title: "Living study plan",
      status: "active",
      currentObjectiveId: current,
      upcomingObjectiveIds: upcoming,
      completedObjectiveIds: [],
      weakConceptIds: [],
      activeSessionId: null,
      progressSummaryJson: { sourceId: input.sourceId },
      recommendationReasonJson: { reason: "bootstrap_after_ingestion" },
      createdAt: now,
      updatedAt: now,
    });

    await dbClient.db
      .update(curricula)
      .set({ activeModuleId: moduleId, updatedAt: now })
      .where(eq(curricula.id, curriculumId));
  }

  if (env.NEO4J_URI && env.NEO4J_PASSWORD) {
    try {
      const driver = createNeo4jDriver(env.NEO4J_URI, env.NEO4J_USERNAME, env.NEO4J_PASSWORD);
      const session = driver.session();
      try {
        const verified = await verifyNeo4jProjection(session);
        if (!verified.ok) {
          throw new Error(verified.message);
        }

        await mergeSourceNode(session, input.notebookId, input.sourceId, input.sourceTitle);

        const neoConcepts = parsed.concepts
          .map((c) => {
            const id = resolveConceptId(conceptLookup, c.name.trim()) ?? conceptIdByName.get(c.name.trim());
            return id ? { id, name: c.name.trim() } : null;
          })
          .filter(Boolean) as Array<{ id: string; name: string }>;
        if (neoConcepts.length) {
          await mergeConceptNodes(session, input.notebookId, neoConcepts);
        }

        for (const relation of relationCandidates.values()) {
          const fromId = relation.fromId;
          const toId = relation.toId;
          if (!fromId || !toId || fromId === toId) continue;
          await mergeConceptRelation(
            session,
            input.notebookId,
            fromId,
            toId,
            relation.relationType as IngestConceptRelationKind,
            relation.confidence ?? null,
          );
        }

        if (curriculumId) {
          await mergeCurriculumNode(
            session,
            input.notebookId,
            curriculumId,
            parsed.curriculumTitle ?? `Learning track · ${input.sourceTitle}`,
          );
          await linkSourceCoversCurriculum(session, input.notebookId, input.sourceId, curriculumId);

          if (moduleId) {
            await mergeCurriculumModuleNode(
              session,
              input.notebookId,
              moduleId,
              curriculumId,
              parsed.curriculumTitle ?? `Learning track · ${input.sourceTitle}`,
              `Bootstrap module generated from ${input.sourceTitle}`,
              0,
              "active",
            );
          }

          if (moduleId && objectiveListId) {
            await mergeObjectiveListNode(
              session,
              input.notebookId,
              objectiveListId,
              curriculumId,
              moduleId,
              "Active objective list",
              "active",
            );
          }

          if (moduleId && objectiveListId && sessionPlanId) {
            await mergeSessionPlanNode(
              session,
              input.notebookId,
              sessionPlanId,
              curriculumId,
              moduleId,
              objectiveListId,
              "Current teaching session",
              "active",
              `Learn the essentials of ${input.sourceTitle}`,
            );
          }

          const objectiveTitles = ["Orient and skim the source", "Solidify core terms", "Apply ideas with self-check"];
          for (let i = 0; i < objectiveIdsOrdered.length; i += 1) {
            const oid = objectiveIdsOrdered[i]!;
            await mergeObjectiveNode(
              session,
              input.notebookId,
              curriculumId,
              oid,
              objectiveTitles[i] ?? `Objective ${i + 1}`,
              i,
              "not_started",
            );
            if (objectiveListId) {
              await session.run(
                `MATCH (ol:objective_list {id: $objectiveListId}), (o:Objective {id: $oid})
                 WHERE ol.notebookId = $notebookId AND o.notebookId = $notebookId
                 MERGE (ol)-[r:PLANS]->(o)
                 SET r.notebookId = $notebookId,
                     r.orderIndex = $orderIndex,
                     r.updatedAt = datetime()`,
                { objectiveListId, oid, notebookId: input.notebookId, orderIndex: i },
              );
            }
            if (sessionPlanId) {
              await session.run(
                `MATCH (sp:session_plan {id: $sessionPlanId}), (o:Objective {id: $oid})
                 WHERE sp.notebookId = $notebookId AND o.notebookId = $notebookId
                 MERGE (sp)-[r:PLANS]->(o)
                 SET r.notebookId = $notebookId,
                     r.orderIndex = $orderIndex,
                     r.updatedAt = datetime()`,
                { sessionPlanId, oid, notebookId: input.notebookId, orderIndex: i },
              );
            }
          }
        }

        if (planId && objectiveIdsOrdered.length) {
          await mergeStudyPlanAndObjectives(
            session,
            input.notebookId,
            planId,
            "Living study plan",
            objectiveIdsOrdered,
            currentObjectiveId ?? objectiveIdsOrdered[0]!,
          );

          for (const coverageItem of coverageProjectionItems) {
            await mergeCoverageItemNode(session, input.notebookId, coverageItem.itemId, coverageItem.title, coverageItem.itemFamily);
            await mergeCoverageRecordNode(
              session,
              input.notebookId,
              coverageItem.recordId,
              coverageItem.itemId,
              coverageItem.status,
            );
          }
        }

        for (const meta of insertedClaimMeta) {
          const primaryConcept = meta.conceptIds[0] ?? null;
          await mergeClaimNode(
            session,
            input.notebookId,
            meta.id,
            meta.text.length > 200 ? `${meta.text.slice(0, 197)}…` : meta.text,
            input.sourceId,
            primaryConcept,
          );
        }

        for (const p of supersedePlans) {
          await mergeClaimSupersedes(session, input.notebookId, p.winnerId, p.olderId);
        }
        for (const pair of contradictionPairs) {
          await mergeClaimContradiction(session, input.notebookId, pair.a, pair.b);
        }

        await mergeWikiPageNode(
          session,
          input.notebookId,
          pageId,
          `Source · ${input.sourceTitle}`,
          pageKey,
          "source_summary",
          null,
        );
        await mergeWikiPageForSource(session, input.notebookId, pageId, input.sourceId);

        for (const c of parsed.concepts) {
          const cid = resolveConceptId(conceptLookup, c.name.trim()) ?? conceptIdByName.get(c.name.trim());
          if (!cid) continue;
          const conceptPageKey = `concept:${cid}`;
          const [row] = await dbClient.db
            .select({ id: wikiPages.id })
            .from(wikiPages)
            .where(
              and(
                eq(wikiPages.notebookId, input.notebookId),
                eq(wikiPages.pageType, "concept"),
                eq(wikiPages.pageKey, conceptPageKey),
              ),
            )
            .limit(1);
          if (!row) continue;
          await mergeWikiPageNode(
            session,
            input.notebookId,
            row.id,
            `Concept · ${c.name.trim()}`,
            conceptPageKey,
            "concept",
            cid,
          );
        }

        await appendEvent(dbClient, {
          notebookId: input.notebookId,
          eventType: "graph.neo4j_projection.updated",
          payload: {
            sourceId: input.sourceId,
            curriculumId: curriculumId ?? null,
            conceptCount: neoConcepts.length,
            relationCount: relationCandidates.size,
          },
        });
      } finally {
        await session.close();
        await driver.close();
      }
    } catch (e) {
      await appendEvent(dbClient, {
        notebookId: input.notebookId,
        eventType: "graph.neo4j_projection.failed",
        payload: {
          sourceId: input.sourceId,
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }

  const lintPages = await dbClient.db.select().from(wikiPages).where(eq(wikiPages.notebookId, input.notebookId));
  const lintConcepts = await dbClient.db.select().from(concepts).where(eq(concepts.notebookId, input.notebookId));
  const lintClaims = await dbClient.db.select().from(claims).where(eq(claims.notebookId, input.notebookId));
  const lintGraph = await dbClient.db.select().from(graphRelations).where(eq(graphRelations.notebookId, input.notebookId));
  const lintIssues = lintNotebookWiki({
    pages: lintPages.map((p) => ({
      id: p.id,
      title: p.title,
      pageType: p.pageType,
      pageKey: p.pageKey,
      markdown: p.markdown,
      sourceClaimIds: p.sourceClaimIds,
      status: p.status,
      updatedAt: p.updatedAt,
      structuredJson: p.structuredJson ?? {},
    })),
    concepts: lintConcepts.map((c) => ({ id: c.id, canonicalName: c.canonicalName })),
    claims: lintClaims.map((c) => ({
      id: c.id,
      status: c.status,
      claimText: c.claimText,
      metadataJson: c.metadataJson ?? {},
    })),
    graphRelations: lintGraph.map((r) => ({
      relationType: r.relationType,
      sourceNodeType: r.sourceNodeType,
      sourceNodeId: r.sourceNodeId,
      targetNodeType: r.targetNodeType,
      targetNodeId: r.targetNodeId,
    })),
  });

  await appendEvent(dbClient, {
    notebookId: input.notebookId,
    eventType: "wiki.lint.completed",
    payload: {
      triggeredBy: "post_ingest_enrichment",
      sourceId: input.sourceId,
      issueCount: lintIssues.length,
      codes: [...new Set(lintIssues.map((i) => i.code))],
    },
  });

  return { ok: true };
}
