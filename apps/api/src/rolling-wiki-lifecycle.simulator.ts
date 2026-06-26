import {
  compileSourceToWikiChangeSet,
  resolvePageReadinessFromWikiPage,
} from "@studyagent/wiki-core";
import { pageReadinessSchema, type GenerationMode, type PageReadiness } from "@studyagent/schemas";

export type RollingWikiPage = {
  id: string;
  pageKey: string;
  pageType: string;
  title: string;
  markdown: string;
  status: string;
  qualityScore: number | null;
  sourceClaimIds: string[];
  structuredJson: Record<string, unknown>;
};

export type RollingWikiModule = {
  id: string;
  orderIndex: number;
  title: string;
  summary: string;
  objectiveIds: string[];
  deepBuilt: boolean;
};

export type RollingWikiArtifact = {
  id: string;
  artifactType: string;
  status: string;
};

export type RollingWikiNotebookState = {
  notebookId: string;
  sourceId: string;
  curriculumId: string;
  modules: RollingWikiModule[];
  pages: RollingWikiPage[];
  artifacts: RollingWikiArtifact[];
  events: string[];
};

export type LlmPolishResult = {
  markdown: string;
  qualityScore: number;
  readiness: PageReadiness;
};

export type ConceptTouchResult = {
  state: RollingWikiNotebookState;
  foregroundTimedOut: boolean;
  pageReadiness: PageReadiness;
};

const AUTO_ARTIFACT_TYPES = new Set(["flashcard_deck", "concept_card", "flashcard"]);

export function simulatePostIngestBaseline(input: {
  notebookId: string;
  sourceId: string;
  sourceVersionId: string;
  sourceTitle: string;
  chunkIds: string[];
  concepts: Array<{ name: string }>;
  claims: Array<{ claimText: string; conceptNames: string[]; evidenceChunkId?: string }>;
  modulePlans: Array<{ title: string; summary: string; objectiveTitles: string[] }>;
  llmAvailable: boolean;
}): RollingWikiNotebookState {
  const wikiChangeSet = compileSourceToWikiChangeSet({
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    sourceVersionId: input.sourceVersionId,
    sourceTitle: input.sourceTitle,
    chunkIds: input.chunkIds,
    extraction: {
      concepts: input.concepts,
      claims: input.claims,
      relations: [],
      sourceSummaryMarkdown: `## ${input.sourceTitle}\n\nBaseline source summary.`,
    },
    existingConcepts: [],
    existingClaims: [],
    priorWikiPages: [],
    nextId: (prefix) => `${prefix}_rolling`,
    now: new Date("2026-06-09T12:00:00.000Z"),
  });

  if (!wikiChangeSet.ok) {
    throw new Error("wiki compilation failed");
  }

  const curriculumId = "cur_rolling";
  const modules: RollingWikiModule[] = input.modulePlans.map((plan, index) => {
    const moduleId = `mod_${index + 1}`;
    const objectiveIds =
      index === 0
        ? plan.objectiveTitles.map((title, objectiveIndex) => `obj_m${index + 1}_${objectiveIndex}`)
        : [];
    return {
      id: moduleId,
      orderIndex: index,
      title: plan.title,
      summary: plan.summary,
      objectiveIds,
      deepBuilt: index === 0,
    };
  });

  const pages: RollingWikiPage[] = wikiChangeSet.changeSet.wikiPages.map((page) => ({
    id: page.id,
    pageKey: page.pageKey,
    pageType: page.pageType,
    title: page.title,
    markdown: page.markdown,
    status: "draft",
    qualityScore: null,
    sourceClaimIds: page.sourceClaimIds,
    structuredJson: {
      ...page.structuredJson,
      generationMode: "heuristic" satisfies GenerationMode,
      pageReadiness: "still_improving" satisfies PageReadiness,
      bootstrapSourceId: input.sourceId,
    },
  }));

  for (const module of modules) {
    pages.push({
      id: `wp_module_${module.id}`,
      pageKey: `module:${module.id}`,
      pageType: "study_guide",
      title: module.title,
      markdown: `## ${module.title}\n\n${module.summary}`,
      status: "draft",
      qualityScore: null,
      sourceClaimIds: [],
      structuredJson: {
        generationMode: "heuristic",
        pageReadiness: "still_improving",
        moduleId: module.id,
      },
    });
  }

  pages.push({
    id: "wp_curriculum",
    pageKey: `curriculum:${curriculumId}`,
    pageType: "study_guide",
    title: input.sourceTitle,
    markdown: `## ${input.sourceTitle}\n\nActive curriculum outline.`,
    status: "draft",
    qualityScore: null,
    sourceClaimIds: [],
    structuredJson: {
      generationMode: "heuristic",
      pageReadiness: "still_improving",
      curriculumId,
    },
  });

  const events = [
    "generation.page.heuristic.created",
    "curriculum.generated",
    input.llmAvailable ? "generation.initial_build.started" : "generation.initial_build.failed",
  ];

  return {
    notebookId: input.notebookId,
    sourceId: input.sourceId,
    curriculumId,
    modules,
    pages,
    artifacts: [],
    events,
  };
}

export function simulateInitialBuild(
  state: RollingWikiNotebookState,
  polish: (page: RollingWikiPage) => LlmPolishResult | null,
): RollingWikiNotebookState {
  const module1 = state.modules.find((module) => module.orderIndex === 0);
  if (!module1) return state;

  const pages = state.pages.map((page) => {
    const isModule1Topic =
      page.pageType === "topic" || (page.pageType === "concept" && module1.objectiveIds.length > 0);
    const isModulePage = page.pageKey === `module:${module1.id}`;
    if (!isModule1Topic && !isModulePage) return page;

    const polished = polish(page);
    if (!polished) return page;

    return {
      ...page,
      markdown: polished.markdown,
      qualityScore: polished.qualityScore,
      structuredJson: {
        ...page.structuredJson,
        generationMode: "llm_polished" satisfies GenerationMode,
        pageReadiness: polished.readiness,
        lastPolishedAt: "2026-06-09T12:05:00.000Z",
      },
    };
  });

  return {
    ...state,
    pages,
    events: [
      ...state.events,
      "generation.initial_build.completed",
      "generation.page.readiness_changed",
    ],
  };
}

export async function simulateConceptTouch(input: {
  state: RollingWikiNotebookState;
  conceptId: string;
  foregroundBudgetMs: number;
  polish: () => Promise<LlmPolishResult>;
}): Promise<ConceptTouchResult> {
  const pageKey = `concept:${input.conceptId}`;
  let page = input.state.pages.find((candidate) => candidate.pageKey === pageKey);
  const nextPages = [...input.state.pages];
  if (!page) {
    page = {
      id: `wp_${input.conceptId}`,
      pageKey,
      pageType: "concept",
      title: input.conceptId,
      markdown: "## Concept\n\nHeuristic placeholder.",
      status: "draft",
      qualityScore: null,
      sourceClaimIds: ["claim_1"],
      structuredJson: {
        conceptId: input.conceptId,
        generationMode: "heuristic",
        pageReadiness: "still_improving",
      },
    };
    nextPages.push(page);
  }

  const baselineState: RollingWikiNotebookState = {
    ...input.state,
    pages: nextPages,
    events: [...input.state.events, "generation.touch.started"],
  };

  let foregroundTimedOut = false;
  let polished: LlmPolishResult;
  try {
    polished = await Promise.race([
      input.polish(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("touch_foreground_timeout")), input.foregroundBudgetMs);
      }),
    ]);
  } catch {
    foregroundTimedOut = true;
    const readiness = resolvePageReadinessFromWikiPage({
      status: page.status,
      qualityScore: page.qualityScore,
      sourceClaimIds: page.sourceClaimIds,
      structuredJson: page.structuredJson,
    });
    return {
      state: {
        ...baselineState,
        events: [...baselineState.events, "generation.touch.foreground_timeout"],
      },
      foregroundTimedOut: true,
      pageReadiness: readiness,
    };
  }

  const updatedPages = baselineState.pages.map((candidate) =>
    candidate.pageKey === pageKey
      ? {
          ...candidate,
          markdown: polished.markdown,
          qualityScore: polished.qualityScore,
          structuredJson: {
            ...candidate.structuredJson,
            generationMode: "tutor_touch" satisfies GenerationMode,
            pageReadiness: polished.readiness,
            touchTrigger: "tutor_touch",
            lastPolishedAt: "2026-06-09T12:08:00.000Z",
          },
        }
      : candidate,
  );

  return {
    state: {
      ...baselineState,
      pages: updatedPages,
      events: [
        ...baselineState.events,
        "generation.touch.completed",
        "wiki.page.readiness_changed",
      ],
    },
    foregroundTimedOut,
    pageReadiness: polished.readiness,
  };
}

export function assertNoAutoFlashcardArtifacts(state: RollingWikiNotebookState): void {
  const autoArtifacts = state.artifacts.filter((artifact) =>
    AUTO_ARTIFACT_TYPES.has(artifact.artifactType),
  );
  if (autoArtifacts.length > 0) {
    throw new Error(
      `unexpected auto artifacts: ${autoArtifacts.map((artifact) => artifact.artifactType).join(", ")}`,
    );
  }
}

export function pageReadinessForPage(page: RollingWikiPage): PageReadiness {
  const stored = pageReadinessSchema.safeParse(page.structuredJson.pageReadiness);
  if (stored.success) return stored.data;
  return resolvePageReadinessFromWikiPage({
    status: page.status,
    qualityScore: page.qualityScore,
    sourceClaimIds: page.sourceClaimIds,
    structuredJson: page.structuredJson,
  });
}
