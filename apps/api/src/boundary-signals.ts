import { and, asc, eq, inArray } from "drizzle-orm";
import { chunks, curriculumModules, objectiveLists, objectives, sourceVersions, sources, type DbClient } from "@studyagent/db";
import type { BoundarySignal } from "@studyagent/schemas";
import type { NotebookStudyState } from "./study-state.js";

type SearchEvidenceRow = {
  title?: string | undefined;
  snippet: string;
  refType: string;
  refId: string;
};

export function buildStandingBoundarySignals(state: NotebookStudyState): BoundarySignal[] {
  const signals: BoundarySignal[] = [];
  const completedIds = new Set(state.studyPlan?.completedObjectives.map((objective) => objective.id) ?? []);
  const currentObjectiveId = state.studyPlan?.currentObjective?.id ?? null;
  const plannedObjectiveIds = state.sessionPlan?.plannedObjectiveIds ?? [];
  const remainingPlannedObjectiveIds = plannedObjectiveIds.filter((id) => id !== currentObjectiveId && !completedIds.has(id));

  if (state.sessionPlan && plannedObjectiveIds.length > 0 && !currentObjectiveId && remainingPlannedObjectiveIds.length === 0) {
    signals.push({
      type: "session_plan_boundary",
      strength: "likely",
      scopeRef: { refType: "session_plan", refId: state.sessionPlan.id },
      summary: `The active session plan "${state.sessionPlan.title}" has no remaining current objective.`,
      evidenceRefs: [{ refType: "session_plan", refId: state.sessionPlan.id }],
    });
  }

  const sourceCoverageComplete =
    state.coverage.total > 0 && state.coverage.planned === 0 && state.coverage.needsReview === 0;
  if (sourceCoverageComplete) {
    signals.push({
      type: "source_coverage_complete",
      strength: state.coverage.checked + state.coverage.mastered > 0 ? "likely" : "weak",
      scopeRef: state.curriculum ? { refType: "curriculum", refId: state.curriculum.id } : undefined,
      summary: "The current source-backed coverage has no remaining planned or needs-review items.",
      evidenceRefs: state.curriculum ? [{ refType: "curriculum", refId: state.curriculum.id }] : [],
    });
  }

  return signals;
}

export async function buildModuleMilestoneSignals(
  dbClient: DbClient,
  input: {
    notebookId: string;
    state: NotebookStudyState;
  },
): Promise<BoundarySignal[]> {
  const moduleId = input.state.module?.id;
  const curriculumId = input.state.curriculum?.id;
  if (!moduleId || !curriculumId) return [];

  const objectiveListRows = await dbClient.db
    .select({ id: objectiveLists.id, objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered })
    .from(objectiveLists)
    .where(and(eq(objectiveLists.notebookId, input.notebookId), eq(objectiveLists.moduleId, moduleId)));
  const moduleObjectiveIds = [...new Set(objectiveListRows.flatMap((row) => row.objectiveIdsOrdered ?? []))];
  if (moduleObjectiveIds.length === 0) return [];

  const moduleObjectiveRows = await dbClient.db
    .select({ id: objectives.id, status: objectives.status })
    .from(objectives)
    .where(and(eq(objectives.notebookId, input.notebookId), inArray(objectives.id, moduleObjectiveIds)));
  const activeObjectiveRows = moduleObjectiveRows.filter(
    (objective) => objective.status !== "completed" && objective.status !== "merged" && objective.status !== "superseded",
  );
  if (activeObjectiveRows.length > 0) return [];

  const [nextModule] = await dbClient.db
    .select({ id: curriculumModules.id, title: curriculumModules.title })
    .from(curriculumModules)
    .where(and(eq(curriculumModules.notebookId, input.notebookId), eq(curriculumModules.curriculumId, curriculumId)))
    .orderBy(asc(curriculumModules.orderIndex))
    .limit(20)
    .then((rows) => {
      const currentIndex = rows.findIndex((row) => row.id === moduleId);
      return currentIndex >= 0 ? rows.slice(currentIndex + 1, currentIndex + 2) : [];
    });

  return [
    {
      type: "module_milestone",
      strength: nextModule ? "likely" : "confirmed",
      scopeRef: { refType: "curriculum_module", refId: moduleId },
      summary: nextModule
        ? `The current module "${input.state.module?.title ?? moduleId}" appears complete; next module is "${nextModule.title}".`
        : `The current module "${input.state.module?.title ?? moduleId}" appears complete and no later module is planned.`,
      evidenceRefs: [
        { refType: "curriculum_module", refId: moduleId },
        ...(nextModule ? [{ refType: "curriculum_module" as const, refId: nextModule.id }] : []),
      ],
    },
  ];
}

export async function buildWikiSearchBoundarySignals(
  dbClient: DbClient,
  input: {
    notebookId: string;
    query: string;
    results: SearchEvidenceRow[];
    requestedSection?: string | null;
  },
): Promise<BoundarySignal[]> {
  const requestedSection = input.requestedSection ?? null;
  if (input.results.length > 0 && !requestedSection) return [];
  if (input.results.length > 0 && requestedSection && input.results.some((result) => resultMentions(result, requestedSection))) {
    return [];
  }

  const scope = await loadSourceScopeSummary(dbClient, input.notebookId).catch(() => null);
  if (!scope) return [];
  if (!scope.sourceRefs.length) return [];

  const requestedTopic = requestedSection ? `Section ${requestedSection}` : normalizeRequestedTopic(input.query);
  const strength = input.results.length === 0 ? "likely" : "weak";
  return [
    {
      type: "source_scope_boundary",
      strength,
      requestedTopic,
      scopeRef: scope.sourceRefs.length === 1 ? scope.sourceRefs[0] : undefined,
      summary:
        input.results.length === 0
          ? `No returned source evidence matched "${requestedTopic}". Current indexed source scope includes ${scope.summary}.`
          : `Returned source evidence did not clearly match "${requestedTopic}". Current indexed source scope includes ${scope.summary}.`,
      evidenceRefs: scope.sourceRefs,
    },
  ];
}

async function loadSourceScopeSummary(
  dbClient: DbClient,
  notebookId: string,
): Promise<{ summary: string; sourceRefs: Array<{ refType: "source"; refId: string }> }> {
  const rows = await dbClient.db
    .select({
      sourceId: sources.id,
      sourceTitle: sources.title,
      headingPath: chunks.headingPath,
      pageStart: chunks.pageStart,
      pageEnd: chunks.pageEnd,
    })
    .from(chunks)
    .innerJoin(sourceVersions, eq(chunks.sourceVersionId, sourceVersions.id))
    .innerJoin(sources, eq(sourceVersions.sourceId, sources.id))
    .where(and(eq(sources.notebookId, notebookId), eq(chunks.chunkType, "retrieval")))
    .orderBy(asc(sources.title), asc(chunks.pageStart), asc(chunks.id))
    .limit(80);

  const sourceRefs = [...new Map(rows.map((row) => [row.sourceId, { refType: "source" as const, refId: row.sourceId }])).values()];
  const sectionNumbers = [...new Set(rows.flatMap((row) => extractSectionNumbers(row.headingPath ?? [])))].slice(0, 8);
  const pageStarts = rows.map((row) => row.pageStart).filter((value): value is number => typeof value === "number");
  const pageEnds = rows.map((row) => row.pageEnd ?? row.pageStart).filter((value): value is number => typeof value === "number");
  const pageSummary = pageStarts.length && pageEnds.length ? `pages ${Math.min(...pageStarts)}-${Math.max(...pageEnds)}` : null;
  const sourceTitles = [...new Set(rows.map((row) => row.sourceTitle))].slice(0, 3);
  const parts = [
    sourceTitles.length ? `sources: ${sourceTitles.join(", ")}` : "uploaded sources",
    sectionNumbers.length ? `sections ${sectionNumbers.join(", ")}` : null,
    pageSummary,
  ].filter(Boolean);
  return {
    summary: parts.join("; "),
    sourceRefs,
  };
}

function extractSectionNumbers(headingPath: string[]): string[] {
  return headingPath
    .map((heading) => heading.match(/\b(\d+(?:\.\d+){1,4})\b/)?.[1] ?? null)
    .filter((value): value is string => Boolean(value));
}

function normalizeRequestedTopic(query: string): string {
  return query.trim().replace(/\s+/g, " ").slice(0, 120) || "the requested topic";
}

function resultMentions(result: SearchEvidenceRow, needle: string): boolean {
  const haystack = `${result.title ?? ""}\n${result.snippet}`.toLowerCase();
  return haystack.includes(needle.toLowerCase());
}
