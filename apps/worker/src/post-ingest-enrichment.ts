import type { StudyAgentEnv } from "@studyagent/config";
import type { DbClient } from "@studyagent/db";
import {
  appendEvent,
  coverageItems,
  coverageRecords,
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
import { projectGraphFromCanonical } from "@studyagent/graph";
import {
  buildConceptLookup,
  compileSourceToWikiChangeSet,
  composeTeachingArc,
  extractCoverageItems,
  lintNotebookWiki,
  registerConceptLookup,
  resolveConceptId,
  type SourceExtractionRelation,
} from "@studyagent/wiki-core";
import { and, desc, eq, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { applyWikiChangeSet } from "./wiki-change-set-persistence.js";
import { enqueueWikiPolishCandidates } from "./wiki-polish-enqueue.js";

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

const curriculumBootstrapPlanSchema = z.object({
  curriculumTitle: z.string().min(1).max(140).optional(),
  modules: z
    .array(
      z.object({
        title: z.string().min(1).max(140),
        summary: z.string().min(1).max(320),
        objectiveTitles: z.array(z.string().min(1).max(140)).min(1).max(4),
      }),
    )
    .min(1)
    .max(3),
});

const sessionBootstrapPlanSchema = z.object({
  sessionGoal: z.string().min(1).max(220),
  plannedObjectiveIndexes: z.array(z.number().int().min(0).max(3)).min(1).max(2),
});

const coverageFamilyRefinementSchema = z.object({
  refinements: z
    .array(
      z.object({
        title: z.string().min(1),
        itemFamily: z.enum([
          "definition",
          "formula",
          "notation",
          "distinction",
          "procedure",
          "example",
          "application",
          "historical_context",
          "misconception",
        ]),
      }),
    )
    .max(40),
});

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

function toExtractionRelations(
  relations: Array<{ fromConcept: string; toConcept: string; relationType: string; confidence?: number | undefined }>,
): SourceExtractionRelation[] {
  return relations.map((relation) => {
    const base: SourceExtractionRelation = {
      fromConcept: relation.fromConcept,
      toConcept: relation.toConcept,
      relationType: relation.relationType,
    };
    if (relation.confidence !== undefined) {
      return { ...base, confidence: relation.confidence };
    }
    return base;
  });
}

function buildConceptGroundedFallbackModules(
  sourceTitle: string,
  conceptNames: string[],
  moduleCount: number,
): Array<{ title: string; summary: string; objectiveTitles: string[] }> {
  const cleanConcepts = conceptNames.map((name) => name.trim()).filter(Boolean);
  const safeModuleCount = Math.max(1, moduleCount);

  return Array.from({ length: safeModuleCount }, (_, index) => {
    const start = Math.floor((index / safeModuleCount) * cleanConcepts.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / safeModuleCount) * cleanConcepts.length));
    const moduleConcepts = cleanConcepts.slice(start, end);
    const primary = moduleConcepts[0] ?? sourceTitle;
    const secondary = moduleConcepts[1] ?? moduleConcepts[0] ?? sourceTitle;

    return {
      title: `Understand ${primary}`,
      summary: moduleConcepts.length
        ? `Build a source-grounded understanding of ${moduleConcepts.join(", ")}.`
        : `Build a source-grounded understanding of ${sourceTitle}.`,
      objectiveTitles: [
        `Explain ${primary}`,
        secondary === primary ? `Apply ${primary}` : `Connect ${primary} with ${secondary}`,
      ],
    };
  });
}

function cleanLearnerTitle(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (/^(objective|module|session)\s*\d*$/i.test(trimmed)) return null;
  if (/^current teaching session$/i.test(trimmed)) return null;
  if (/^(obj|mod|sess|cur|cnc|cov|clm|wp)_[a-z0-9_]+$/i.test(trimmed)) return null;
  return trimmed;
}

function conceptNameForId(conceptNamesById: Map<string, string>, conceptId: string): string {
  return cleanLearnerTitle(conceptNamesById.get(conceptId)) ?? "source concept";
}

function objectiveTitleForIndex(
  objectiveTitles: string[],
  objectiveIndex: number,
  sourceTitle: string,
  conceptNames: string[],
): string {
  const planned = cleanLearnerTitle(objectiveTitles[objectiveIndex]);
  if (planned) return planned;
  const primary = cleanLearnerTitle(conceptNames[objectiveIndex]) ?? cleanLearnerTitle(conceptNames[0]) ?? cleanLearnerTitle(sourceTitle) ?? "the source";
  return objectiveIndex === 0 ? `Explain ${primary}` : `Apply ${primary}`;
}

function sessionTitleForObjectives(objectiveTitles: string[], sourceTitle: string): string {
  const first = cleanLearnerTitle(objectiveTitles[0]);
  const second = cleanLearnerTitle(objectiveTitles[1]);
  if (first && second) return `${first} and ${second}`;
  if (first) return first;
  return cleanLearnerTitle(sourceTitle) ?? "First tutoring session";
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
  return parseLlmJsonObject(text);
}

export function parseLlmJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const candidates = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next repair path.
    }
    try {
      return JSON.parse(escapeInvalidJsonBackslashes(candidate)) as unknown;
    } catch {
      // Keep the original JSON.parse error below for debuggability.
    }
  }

  return JSON.parse(trimmed) as unknown;
}

function escapeInvalidJsonBackslashes(value: string): string {
  return value.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
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

async function planCurriculumBootstrapWithLLM(
  env: StudyAgentEnv,
  input: { sourceTitle: string; curriculumTitle?: string; conceptNames: string[] },
): Promise<z.infer<typeof curriculumBootstrapPlanSchema> | null> {
  try {
    const raw = await openRouterJsonObject(
      env,
      [
        "You design compact learning modules for a single source notebook.",
        "Return ONLY a JSON object with keys: curriculumTitle?, modules.",
        "Each module must include title, summary, objectiveTitles.",
        "Keep output practical and ordered foundational -> applied.",
      ].join("\n"),
      [
        `Source title: ${input.sourceTitle}`,
        ...(input.curriculumTitle ? [`Existing curriculum title: ${input.curriculumTitle}`] : []),
        `Concepts: ${input.conceptNames.slice(0, 18).join(", ") || "none"}`,
      ].join("\n"),
    );
    return curriculumBootstrapPlanSchema.parse(raw);
  } catch {
    return null;
  }
}

async function planSessionBootstrapWithLLM(
  env: StudyAgentEnv,
  input: { sourceTitle: string; moduleTitle: string; objectiveTitles: string[] },
): Promise<z.infer<typeof sessionBootstrapPlanSchema> | null> {
  try {
    const raw = await openRouterJsonObject(
      env,
      [
        "You create a first tutoring session plan from objectives.",
        "Return ONLY a JSON object with keys: sessionGoal, plannedObjectiveIndexes.",
        "plannedObjectiveIndexes must point into provided objectiveTitles.",
      ].join("\n"),
      [
        `Source title: ${input.sourceTitle}`,
        `Module: ${input.moduleTitle}`,
        ...input.objectiveTitles.map((title, index) => `objective[${index}]: ${title}`),
      ].join("\n"),
    );
    return sessionBootstrapPlanSchema.parse(raw);
  } catch {
    return null;
  }
}

async function refineCoverageFamiliesWithLLM(
  env: StudyAgentEnv,
  items: Array<{ title: string; itemFamily: string; description?: string | null }>,
): Promise<Map<string, z.infer<typeof coverageFamilyRefinementSchema>["refinements"][number]["itemFamily"]>> {
  if (!env.OPENROUTER_API_KEY || items.length === 0) return new Map();
  try {
    const raw = await openRouterJsonObject(
      env,
      [
        "You refine pedagogical coverage-item families for tutoring artifacts.",
        "Return ONLY JSON object with key refinements.",
        "Use one of: definition, formula, notation, distinction, procedure, example, application, historical_context, misconception.",
      ].join("\n"),
      items
        .slice(0, 30)
        .map((item) => `title: ${item.title}\ncurrentFamily: ${item.itemFamily}\ndescription: ${item.description ?? ""}`)
        .join("\n---\n"),
    );
    const parsed = coverageFamilyRefinementSchema.parse(raw);
    return new Map(parsed.refinements.map((entry) => [entry.title, entry.itemFamily]));
  } catch {
    return new Map();
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
    "- sourceSummaryMarkdown: string (rich markdown overview of the source with sections: what this source covers, key ideas, formulas/notation, examples/applications, misconceptions, and practice prompts)",
    "- curriculumTitle?: string",
    "Prefer canonical noun phrases for concepts and avoid near-duplicate concepts when one concept can be expressed as an alias of another.",
    "Prefer 'Phenomenological Law' over shortened forms like 'Phenomenological' when the law itself is the concept.",
    "relationType must be one of: depends_on, supports, example_of, contradicts, covers.",
    "relations must use concept names from your concepts list (exact strings).",
    "Each claim must cite evidenceChunkId using one of the chunk ids from the evidence section when possible.",
    "Wiki markdown must be useful to a student: no placeholders, no one-line summaries, and no generic study advice unless tied to the source.",
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

  const now = new Date();
  const sourceSummaryPageKey = `source:${input.sourceId}`;

  const existingConcepts = await dbClient.db
    .select()
    .from(concepts)
    .where(eq(concepts.notebookId, input.notebookId));

  const excludedClaimStatuses = ["superseded", "deprecated", "archived"] as const;
  const existingClaimsRows = await dbClient.db
    .select({
      id: claims.id,
      sourceId: claims.sourceId,
      claimText: claims.claimText,
      createdAt: claims.createdAt,
      status: claims.status,
    })
    .from(claims)
    .where(
      and(
        eq(claims.notebookId, input.notebookId),
        ne(claims.sourceId, input.sourceId),
        notInArray(claims.status, [...excludedClaimStatuses]),
      ),
    );

  const priorConceptPages = await dbClient.db
    .select({ pageKey: wikiPages.pageKey, pageType: wikiPages.pageType, markdown: wikiPages.markdown })
    .from(wikiPages)
    .where(
      and(
        eq(wikiPages.notebookId, input.notebookId),
        eq(wikiPages.pageType, "concept"),
        sql`(${wikiPages.structuredJson}->>'bootstrapSourceId') = ${input.sourceId}`,
      ),
    );

  const [priorSummary] = await dbClient.db
    .select({ pageKey: wikiPages.pageKey, pageType: wikiPages.pageType, markdown: wikiPages.markdown })
    .from(wikiPages)
    .where(
      and(
        eq(wikiPages.notebookId, input.notebookId),
        eq(wikiPages.pageType, "source_summary"),
        eq(wikiPages.pageKey, sourceSummaryPageKey),
      ),
    )
    .limit(1);

  const compilation = compileSourceToWikiChangeSet({
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    sourceVersionId: input.sourceVersionId,
    sourceTitle: input.sourceTitle,
    chunkIds: input.chunks.map((c) => c.id),
    maxConceptPages: 6,
    extraction: {
      concepts: parsed.concepts.map((c) => ({
        name: c.name,
        ...(c.conceptType ? { conceptType: c.conceptType } : {}),
        ...(c.aliases ? { aliases: c.aliases } : {}),
      })),
      claims: parsed.claims.map((c) => ({
        claimText: c.claimText,
        ...(c.claimType ? { claimType: c.claimType } : {}),
        conceptNames: c.conceptNames,
        ...(c.evidenceChunkId ? { evidenceChunkId: c.evidenceChunkId } : {}),
      })),
      relations: toExtractionRelations(parsed.relations),
      sourceSummaryMarkdown: parsed.sourceSummaryMarkdown,
    },
    existingConcepts: existingConcepts.map((c) => ({
      id: c.id,
      canonicalName: c.canonicalName,
      aliases: c.aliases,
    })),
    existingClaims: existingClaimsRows.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      claimText: c.claimText,
      createdAtMs: c.createdAt.getTime(),
      status: c.status,
    })),
    priorWikiPages: [
      ...priorConceptPages,
      ...(priorSummary
        ? [{ pageKey: priorSummary.pageKey, pageType: priorSummary.pageType, markdown: priorSummary.markdown }]
        : []),
    ],
    focusedRelations: toExtractionRelations(focusedRelations),
    now,
  });

  if (!compilation.ok) {
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "wiki.compilation.failed",
      payload: {
        sourceId: input.sourceId,
        reasons: compilation.reasons,
      },
    });
    return { ok: false, reason: compilation.reasons.map((r) => r.message).join("; ") };
  }

  const changeSet = compilation.changeSet;
  await applyWikiChangeSet(dbClient, {
    changeSet,
    extractionModel: env.DEFAULT_EXTRACTION_MODEL,
  });

  await enqueueWikiPolishCandidates(dbClient, {
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    targetConceptIds: changeSet.concepts.map((concept) => concept.id),
    maxCandidates: 5,
  });

  const { lookup: conceptLookup, byId: conceptsById } = buildConceptLookup(
    existingConcepts.map((c) => ({ id: c.id, canonicalName: c.canonicalName, aliases: c.aliases })),
  );
  const conceptIdByName = new Map<string, string>();
  for (const concept of existingConcepts) {
    conceptIdByName.set(concept.canonicalName, concept.id);
  }
  for (const concept of changeSet.concepts) {
    conceptIdByName.set(concept.canonicalName, concept.id);
    if (concept.action === "create") {
      conceptsById.set(concept.id, {
        id: concept.id,
        canonicalName: concept.canonicalName,
        aliases: concept.aliases,
      });
      registerConceptLookup(conceptLookup, concept.id, [concept.canonicalName, ...concept.aliases]);
    } else {
      const existing = conceptsById.get(concept.id);
      if (existing) {
        conceptsById.set(concept.id, { ...existing, aliases: concept.aliases });
        registerConceptLookup(conceptLookup, concept.id, [concept.canonicalName, ...concept.aliases]);
      }
    }
  }
  for (const c of parsed.concepts) {
    const name = c.name.trim();
    if (!conceptIdByName.has(name)) {
      const id = resolveConceptId(conceptLookup, name);
      if (id) conceptIdByName.set(name, id);
    }
  }

  const conceptNamesById = new Map(
    [...conceptsById.values()].map((concept) => [concept.id, concept.canonicalName]),
  );

  const sourceSummaryPage = changeSet.wikiPages.find((p) => p.pageType === "source_summary");
  const pageId = sourceSummaryPage?.id ?? `wp_${crypto.randomUUID().replaceAll("-", "")}`;
  const pageKey = sourceSummaryPage?.pageKey ?? sourceSummaryPageKey;

  const [nb] = await dbClient.db.select().from(notebooks).where(eq(notebooks.id, input.notebookId)).limit(1);
  if (!nb) {
    return { ok: false, reason: "notebook_missing" };
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
  let planId: string | undefined;
  let currentObjectiveId: string | undefined;

  if (!existingPlan) {
    curriculumId = `cur_${crypto.randomUUID().replaceAll("-", "")}`;
    await dbClient.db.insert(curricula).values({
      id: curriculumId,
      notebookId: input.notebookId,
      title: cleanLearnerTitle(parsed.curriculumTitle) ?? cleanLearnerTitle(input.sourceTitle) ?? "Source-based course",
      curriculumType: "from_sources",
      scopeJson: { sourceIds: [input.sourceId] },
      status: "draft",
      sourceIds: [input.sourceId],
      coverageSummaryJson: { conceptCount: parsed.concepts.length, claimCount: parsed.claims.length },
      confidence: 0.65,
      createdAt: now,
      updatedAt: now,
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "curriculum.generated",
      payload: {
        curriculumId,
        sourceId: input.sourceId,
      },
    });

    const seedConceptIds = parsed.concepts
      .map((c) => conceptIdByName.get(c.name.trim()))
      .filter(Boolean) as string[];
    const llmCurriculumPlan = await planCurriculumBootstrapWithLLM(env, {
      sourceTitle: input.sourceTitle,
      ...(parsed.curriculumTitle ? { curriculumTitle: parsed.curriculumTitle } : {}),
      conceptNames: parsed.concepts.map((c) => c.name.trim()),
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "curriculum.bootstrap.planned",
      payload: {
        curriculumId,
        planner: llmCurriculumPlan ? "llm_curated" : "deterministic_fallback",
        sourceId: input.sourceId,
        conceptCount: parsed.concepts.length,
      },
    });
    if (llmCurriculumPlan?.curriculumTitle) {
      await dbClient.db
        .update(curricula)
        .set({ title: cleanLearnerTitle(llmCurriculumPlan.curriculumTitle) ?? cleanLearnerTitle(input.sourceTitle) ?? "Source-based course", updatedAt: now })
        .where(eq(curricula.id, curriculumId));
    }
    const fallbackModuleCount = Math.min(3, Math.max(2, Math.ceil(seedConceptIds.length / 5)));
    const curriculumModulesPlan =
      llmCurriculumPlan?.modules?.length
        ? llmCurriculumPlan.modules
        : buildConceptGroundedFallbackModules(input.sourceTitle, parsed.concepts.map((c) => c.name.trim()), fallbackModuleCount);

    moduleId = `mod_${crypto.randomUUID().replaceAll("-", "")}`;
    objectiveListId = `objlist_${crypto.randomUUID().replaceAll("-", "")}`;
    sessionPlanId = `sessplan_${crypto.randomUUID().replaceAll("-", "")}`;
    const moduleIds: string[] = [];
    const moduleObjectives: string[][] = [];

    for (let m = 0; m < curriculumModulesPlan.length; m += 1) {
      const modId = `mod_${crypto.randomUUID().replaceAll("-", "")}`;
      moduleIds.push(modId);
      const prevModuleId: string | undefined = m > 0 ? moduleIds[m - 1] : undefined;
      const start = Math.floor((m / curriculumModulesPlan.length) * seedConceptIds.length);
      const end = Math.floor(((m + 1) / curriculumModulesPlan.length) * seedConceptIds.length);
      const modConcepts = seedConceptIds.slice(start, end);
      const modulePlan = curriculumModulesPlan[m]!;
      const moduleConceptNames = modConcepts.map((conceptId) => conceptNameForId(conceptNamesById, conceptId));
      const moduleTitle = cleanLearnerTitle(modulePlan.title) ?? `Understand ${moduleConceptNames[0] ?? input.sourceTitle}`;

      await dbClient.db.insert(curriculumModules).values({
        id: modId,
        notebookId: input.notebookId,
        curriculumId,
        title: moduleTitle,
        summary: modulePlan.summary,
        orderIndex: m,
        status: m === 0 ? "active" : "not_started",
        sourceRefsJson: [{ sourceId: input.sourceId }],
        targetConceptIds: modConcepts,
        prerequisiteModuleIds: prevModuleId ? [prevModuleId] : [],
        estimatedSessionCount: Math.max(2, Math.ceil(modConcepts.length / 3)),
        coverageRequirementsJson: { conceptCount: modConcepts.length, claimCount: Math.min(5, parsed.claims.length) },
        masteryGateJson: { minObjectivesCompleted: 1 },
        createdAt: now,
        updatedAt: now,
      });
      await appendEvent(dbClient, {
        notebookId: input.notebookId,
        eventType: "module.generated",
        payload: {
          moduleId: modId,
          curriculumId,
          orderIndex: m,
          status: m === 0 ? "active" : "not_started",
        },
      });

      const objIds: string[] = [];
      for (let i = 0; i < modulePlan.objectiveTitles.length; i += 1) {
        const oid = `obj_${crypto.randomUUID().replaceAll("-", "")}`;
        const objectiveTitle = objectiveTitleForIndex(
          modulePlan.objectiveTitles,
          i,
          input.sourceTitle,
          modConcepts.map((conceptId) => conceptNameForId(conceptNamesById, conceptId)),
        );
        objIds.push(oid);
        await dbClient.db.insert(objectives).values({
          id: oid,
          notebookId: input.notebookId,
          curriculumId,
          title: objectiveTitle,
          status: "not_started",
          orderIndex: i,
          prerequisiteConceptIds: [],
          targetConceptIds: modConcepts.slice(0, 3),
          successCriteriaJson: { minClaimsReviewed: Math.min(3, parsed.claims.length) },
          sourceRefsJson: [{ sourceId: input.sourceId }],
          suggestedMode: "explore",
          readinessScore: 0.6,
          createdAt: now,
          updatedAt: now,
        });
        await appendEvent(dbClient, {
          notebookId: input.notebookId,
          eventType: "objective.generated",
          payload: {
            objectiveId: oid,
            moduleId: modId,
            curriculumId,
            orderIndex: i,
            title: objectiveTitle,
          },
        });
      }
      moduleObjectives.push(objIds);
    }

    // Set first module as active
    moduleId = moduleIds[0] ?? moduleId;
    const objectiveIds = moduleObjectives[0] ?? [];
    const firstModulePlan = curriculumModulesPlan[0];
    const firstModuleObjectiveTitles = firstModulePlan?.objectiveTitles ?? [];
    const llmSessionPlan = await planSessionBootstrapWithLLM(env, {
      sourceTitle: input.sourceTitle,
      moduleTitle: firstModulePlan?.title ?? `Module 1 · ${input.sourceTitle}`,
      objectiveTitles: firstModuleObjectiveTitles,
    });
    const llmPlannedObjectiveIds =
      llmSessionPlan?.plannedObjectiveIndexes
        .map((index) => objectiveIds[index])
        .filter((value): value is string => typeof value === "string")
        .slice(0, 2) ?? [];
    const plannedObjectiveIds = llmPlannedObjectiveIds.length > 0 ? llmPlannedObjectiveIds : objectiveIds.slice(0, 2);
    const teachingArcDrafts = plannedObjectiveIds.map((objectiveId) => {
      const objectiveTitle =
        objectiveTitleForIndex(
          firstModuleObjectiveTitles,
          objectiveIds.indexOf(objectiveId),
          input.sourceTitle,
          seedConceptIds.map((conceptId) => conceptNameForId(conceptNamesById, conceptId)),
        );
      return composeTeachingArc({
        objectiveId,
        objectiveTitle,
        targetConceptNames: parsed.concepts.map((c) => c.name.trim()).slice(0, 4),
      });
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "session_plan.bootstrap.planned",
      payload: {
        sessionPlanId,
        planner: llmSessionPlan ? "llm_curated" : "deterministic_fallback",
        plannedObjectiveIds,
      },
    });
    if (teachingArcDrafts.length > 0) {
      await appendEvent(dbClient, {
        notebookId: input.notebookId,
        eventType: "teaching_arc.bootstrap.embedded",
        payload: {
          sessionPlanId,
          objectiveCount: teachingArcDrafts.length,
          arcIds: teachingArcDrafts.map((arc) => arc.id),
        },
      });
    }
    // Create objective list for first module
    objectiveListId = `objlist_${crypto.randomUUID().replaceAll("-", "")}`;
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
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "objective_list.generated",
      payload: {
        objectiveListId,
        curriculumId,
        moduleId,
        currentObjectiveId: objectiveIds[0] ?? null,
      },
    });

    await dbClient.db.insert(sessionPlans).values({
      id: sessionPlanId,
      notebookId: input.notebookId,
      curriculumId,
      moduleId,
      objectiveListId,
      title: sessionTitleForObjectives(
        plannedObjectiveIds.map((objectiveId) =>
          objectiveTitleForIndex(
            firstModuleObjectiveTitles,
            objectiveIds.indexOf(objectiveId),
            input.sourceTitle,
            seedConceptIds.map((conceptId) => conceptNameForId(conceptNamesById, conceptId)),
          ),
        ),
        input.sourceTitle,
      ),
      status: "active",
      sessionGoal: llmSessionPlan?.sessionGoal ?? `Learn the essentials of ${input.sourceTitle}`,
      plannedObjectiveIds,
      openerJson: {},
      diagnosticQuestionIds: [],
      teachingArcIds: [],
      artifactRefsJson: [],
      exitCriteriaJson: {},
      recommendationReasonJson: {
        reason: "bootstrap_after_ingestion",
        planner: llmCurriculumPlan ? "llm_curated" : "deterministic_fallback",
        sessionPlanner: llmSessionPlan ? "llm_curated" : "deterministic_fallback",
        teachingArcDrafts: teachingArcDrafts.map((arc) => ({
          id: arc.id,
          objectiveId: arc.objectiveId,
          title: arc.title,
          blockCount: arc.blocks.length,
        })),
      },
      createdByRunId: null,
      createdAt: now,
      updatedAt: now,
    });
    await appendEvent(dbClient, {
      notebookId: input.notebookId,
      eventType: "session_plan.generated",
      payload: {
        sessionPlanId,
        objectiveListId,
        curriculumId,
        moduleId,
        plannedObjectiveIds,
      },
    });
    // Validate session plan persistence and planned objective consistency
    try {
      const [persisted] = await dbClient.db
        .select()
        .from(sessionPlans)
        .where(eq(sessionPlans.id, sessionPlanId))
        .limit(1);

      if (!persisted) {
        await appendEvent(dbClient, {
          notebookId: input.notebookId,
          eventType: "session_plan.persistence_failed",
          payload: { sessionPlanId, reason: "missing_after_insert" },
        });
      } else {
        const planned: string[] = Array.isArray(persisted.plannedObjectiveIds) ? persisted.plannedObjectiveIds : [];
        const missing = planned.filter((id) => !objectiveIds.includes(id));
        if (missing.length) {
          await appendEvent(dbClient, {
            notebookId: input.notebookId,
            eventType: "session_plan.inconsistent_planned_objectives",
            payload: { sessionPlanId, missingPlannedObjectiveIds: missing },
          });
        }
      }
    } catch (e) {
      await appendEvent(dbClient, {
        notebookId: input.notebookId,
        eventType: "session_plan.persistence_check_error",
        payload: { sessionPlanId, error: e instanceof Error ? e.message : String(e) },
      });
    }
    // Update curriculum with active module
    await dbClient.db.update(curricula).set({ activeModuleId: moduleId }).where(eq(curricula.id, curriculumId));

    const extractedCoverageSeedItems = input.chunks.flatMap((chunk) =>
      extractCoverageItems({
        notebookId: input.notebookId,
        sourceId: input.sourceId,
        sourceVersionId: input.sourceVersionId,
        chunkText: chunk.text,
      }),
    );

    const llmCoverageRefinements = await refineCoverageFamiliesWithLLM(
      env,
      extractedCoverageSeedItems.map((item) => ({
        title: item.title.slice(0, 160),
        itemFamily: item.itemFamily,
        description: item.description ?? null,
      })),
    );

    const coverageSeedItems =
      extractedCoverageSeedItems.length > 0
        ? extractedCoverageSeedItems.map((item) => ({
            itemFamily: item.itemFamily,
            title: item.title.slice(0, 160),
            description: item.description ?? null,
            conceptId: item.conceptId ?? null,
            claimId: item.claimId ?? null,
            metadataJson: {
              ...item.metadataJson,
              seededBy: "coverage_family_extractor",
              ...(llmCoverageRefinements.has(item.title.slice(0, 160))
                ? {
                    llmFamilyRefinedFrom: item.itemFamily,
                    llmFamilyRefinedTo: llmCoverageRefinements.get(item.title.slice(0, 160)),
                  }
                : {}),
            } as Record<string, unknown>,
            ...(llmCoverageRefinements.has(item.title.slice(0, 160))
              ? { itemFamily: llmCoverageRefinements.get(item.title.slice(0, 160)) ?? item.itemFamily }
              : {}),
          }))
        : [
            ...seedConceptIds.map((conceptId) => ({
              itemFamily: "definition",
              title: `Core concept: ${conceptNameForId(conceptNamesById, conceptId)}`,
              description: null as string | null,
              conceptId,
              claimId: null as string | null,
              metadataJson: { seededBy: "post_ingest_bootstrap_fallback" } as Record<string, unknown>,
            })),
            ...parsed.claims.slice(0, 5).map((claim) => ({
              itemFamily: "example",
              title: claim.claimText.slice(0, 120),
              description: null as string | null,
              conceptId: null as string | null,
              claimId: null as string | null,
              metadataJson: { seededBy: "post_ingest_bootstrap_fallback" } as Record<string, unknown>,
            })),
          ];

    const objectiveCoverageFamilies: Array<string[]> = [
      ["definition", "notation", "distinction", "historical_context"],
      ["formula", "procedure", "example"],
      ["application", "misconception"],
    ];
    const coverageByFamily = new Map<string, string[]>();
    const conceptIdsByObjective = objectiveIds.map(() => new Set<string>());

    for (const item of coverageSeedItems) {
      const coverageItemId = `cov_${crypto.randomUUID().replaceAll("-", "")}`;
      const coverageRecordId = `covrec_${crypto.randomUUID().replaceAll("-", "")}`;
      const familyItems = coverageByFamily.get(item.itemFamily) ?? [];
      familyItems.push(coverageItemId);
      coverageByFamily.set(item.itemFamily, familyItems);
      await dbClient.db.insert(coverageItems).values({
        id: coverageItemId,
        notebookId: input.notebookId,
        sourceId: input.sourceId,
        sourceVersionId: input.sourceVersionId,
        itemFamily: item.itemFamily,
        title: item.title,
        description: item.description,
        conceptId: item.conceptId,
        claimId: item.claimId,
        sourceRefsJson: [{ sourceId: input.sourceId }],
        metadataJson: item.metadataJson,
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

      if (item.conceptId) {
        for (let objectiveIndex = 0; objectiveIndex < objectiveCoverageFamilies.length; objectiveIndex += 1) {
          const families = objectiveCoverageFamilies[objectiveIndex]!;
          if (families.includes(item.itemFamily)) {
            conceptIdsByObjective[objectiveIndex]!.add(item.conceptId);
          }
        }
      }
    }

    for (let i = 0; i < objectiveIds.length; i += 1) {
      const objectiveId = objectiveIds[i]!;
      const mustCoverCoverageItemIds = (objectiveCoverageFamilies[i] ?? []).flatMap(
        (family) => coverageByFamily.get(family) ?? [],
      );
      const targetConceptIds = [
        ...new Set([
          ...Array.from(conceptIdsByObjective[i] ?? []),
          ...(i === 0 ? seedConceptIds.slice(0, 5) : []),
        ]),
      ];
      await dbClient.db
        .update(objectives)
        .set({
          targetConceptIds,
          successCriteriaJson: {
            minClaimsReviewed: Math.min(3, parsed.claims.length),
            mustCoverCoverageItemIds: mustCoverCoverageItemIds.slice(0, 24),
            coverageFamilies: objectiveCoverageFamilies[i] ?? [],
          },
          updatedAt: now,
        })
        .where(eq(objectives.id, objectiveId));
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
  } else {
    planId = existingPlan.id;
    currentObjectiveId = existingPlan.currentObjectiveId ?? undefined;
    objectiveIdsOrdered = [
      ...(existingPlan.currentObjectiveId ? [existingPlan.currentObjectiveId] : []),
      ...(existingPlan.upcomingObjectiveIds ?? []),
    ];

    const [activeCurriculum] = await dbClient.db
      .select({ id: curricula.id, activeModuleId: curricula.activeModuleId })
      .from(curricula)
      .where(and(eq(curricula.notebookId, input.notebookId), eq(curricula.status, "active")))
      .orderBy(desc(curricula.updatedAt))
      .limit(1);
    curriculumId = activeCurriculum?.id;
    moduleId = activeCurriculum?.activeModuleId ?? undefined;

    if (moduleId) {
      const [activeObjectiveList] = await dbClient.db
        .select({ id: objectiveLists.id })
        .from(objectiveLists)
        .where(
          and(
            eq(objectiveLists.notebookId, input.notebookId),
            eq(objectiveLists.moduleId, moduleId),
            eq(objectiveLists.status, "active"),
          ),
        )
        .orderBy(desc(objectiveLists.updatedAt))
        .limit(1);
      objectiveListId = activeObjectiveList?.id;
      if (objectiveListId) {
        const [activeSessionPlan] = await dbClient.db
          .select({ id: sessionPlans.id })
          .from(sessionPlans)
          .where(
            and(
              eq(sessionPlans.notebookId, input.notebookId),
              eq(sessionPlans.objectiveListId, objectiveListId),
              eq(sessionPlans.status, "active"),
            ),
          )
          .orderBy(desc(sessionPlans.updatedAt))
          .limit(1);
        sessionPlanId = activeSessionPlan?.id;
      }
    }
  }

  if (existingPlan) {
    const extractedCoverageSeedItems = input.chunks.flatMap((chunk) =>
      extractCoverageItems({
        notebookId: input.notebookId,
        sourceId: input.sourceId,
        sourceVersionId: input.sourceVersionId,
        chunkText: chunk.text,
      }),
    );

    const llmCoverageRefinements = await refineCoverageFamiliesWithLLM(
      env,
      extractedCoverageSeedItems.map((item) => ({
        title: item.title.slice(0, 160),
        itemFamily: item.itemFamily,
        description: item.description ?? null,
      })),
    );

    const coverageSeedItems =
      extractedCoverageSeedItems.length > 0
        ? extractedCoverageSeedItems.map((item) => ({
          itemFamily: item.itemFamily,
          title: item.title.slice(0, 160),
          description: item.description ?? null,
          conceptId: item.conceptId ?? null,
          claimId: item.claimId ?? null,
          metadataJson: {
            ...item.metadataJson,
            seededBy: "coverage_family_extractor",
            ...(llmCoverageRefinements.has(item.title.slice(0, 160))
              ? {
                  llmFamilyRefinedFrom: item.itemFamily,
                  llmFamilyRefinedTo: llmCoverageRefinements.get(item.title.slice(0, 160)),
                }
              : {}),
          } as Record<string, unknown>,
          ...(llmCoverageRefinements.has(item.title.slice(0, 160))
            ? { itemFamily: llmCoverageRefinements.get(item.title.slice(0, 160)) ?? item.itemFamily }
            : {}),
          }))
        : [];

    const objectiveCoverageFamilies: Array<string[]> = [
      ["definition", "notation", "distinction", "historical_context"],
      ["formula", "procedure", "example"],
      ["application", "misconception"],
    ];
    const coverageByFamily = new Map<string, string[]>();

    for (const item of coverageSeedItems) {
    const coverageItemId = `cov_${crypto.randomUUID().replaceAll("-", "")}`;
    const coverageRecordId = `covrec_${crypto.randomUUID().replaceAll("-", "")}`;
    const familyItems = coverageByFamily.get(item.itemFamily) ?? [];
    familyItems.push(coverageItemId);
    coverageByFamily.set(item.itemFamily, familyItems);
    await dbClient.db.insert(coverageItems).values({
      id: coverageItemId,
      notebookId: input.notebookId,
      sourceId: input.sourceId,
      sourceVersionId: input.sourceVersionId,
      itemFamily: item.itemFamily,
      title: item.title,
      description: item.description,
      conceptId: item.conceptId,
      claimId: item.claimId,
      sourceRefsJson: [{ sourceId: input.sourceId }],
      metadataJson: item.metadataJson,
      createdAt: now,
      updatedAt: now,
    });

    await dbClient.db.insert(coverageRecords).values({
      id: coverageRecordId,
      notebookId: input.notebookId,
      coverageItemId,
      curriculumId: curriculumId ?? null,
      moduleId: moduleId ?? null,
      objectiveListId: objectiveListId ?? null,
      sessionPlanId: sessionPlanId ?? null,
      status: "planned",
      evidenceJson: { sourceId: input.sourceId },
      updatedByRunId: null,
      createdAt: now,
      updatedAt: now,
    });

    }

    for (let i = 0; i < objectiveIdsOrdered.length; i += 1) {
      const objectiveId = objectiveIdsOrdered[i];
      if (!objectiveId) continue;
      const mustCoverCoverageItemIds = (objectiveCoverageFamilies[i] ?? []).flatMap(
        (family) => coverageByFamily.get(family) ?? [],
      );
      if (mustCoverCoverageItemIds.length === 0) continue;
      await dbClient.db
        .update(objectives)
        .set({
          successCriteriaJson: {
            minClaimsReviewed: Math.min(3, parsed.claims.length),
            mustCoverCoverageItemIds: mustCoverCoverageItemIds.slice(0, 24),
            coverageFamilies: objectiveCoverageFamilies[i] ?? [],
          },
          updatedAt: now,
        })
        .where(eq(objectives.id, objectiveId));
    }
  }

  if (env.NEO4J_URI && env.NEO4J_PASSWORD) {
    const projectionResult = await projectGraphFromCanonical(
      dbClient,
      {
        neo4jUri: env.NEO4J_URI,
        neo4jUsername: env.NEO4J_USERNAME,
        neo4jPassword: env.NEO4J_PASSWORD,
      },
      {
        notebookId: input.notebookId,
        scope: "source",
        sourceId: input.sourceId,
        rebuild: true,
      },
    );

    if (projectionResult.ok) {
      await appendEvent(dbClient, {
        notebookId: input.notebookId,
        eventType: "graph.neo4j_projection.updated",
        payload: {
          sourceId: input.sourceId,
          curriculumId: curriculumId ?? null,
          operationCount: projectionResult.operationCount,
          scope: "source",
        },
      });
    } else {
      await appendEvent(dbClient, {
        notebookId: input.notebookId,
        eventType: "graph.neo4j_projection.failed",
        payload: {
          sourceId: input.sourceId,
          code: projectionResult.error.code,
          message: projectionResult.error.message,
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
