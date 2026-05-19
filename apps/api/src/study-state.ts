import { and, desc, eq, inArray } from "drizzle-orm";
import {
  artifacts,
  concepts,
  coverageItems,
  coverageRecords,
  curricula,
  curriculumModules,
  learningState,
  objectiveLists,
  objectives,
  sessionPlans,
  sources,
  studentProfiles,
  studyPlans,
  tutorSessions,
  type DbClient,
} from "@studyagent/db";
import type { LearnerProgressSummary, LearnerReadiness, SourceLevelRecord } from "@studyagent/schemas";
import { deriveLearnerProgressSummary } from "./learner-progress.js";
import {
  buildConceptLearnerReadiness,
  buildSelfReportedLearnerReadiness,
  inferSourceLevelFromSignals,
} from "@studyagent/schemas";

type StudyObjectiveSummary = {
  id: string;
  title: string;
  status: string;
};

type WeakConceptSummary = {
  id: string;
  name: string;
};

type PlanningRow = {
  id: string;
  updatedAt: Date;
  status?: string;
};

type CoverageGapSummary = {
  coverageItemId: string;
  title: string;
  itemFamily: string;
  status: string;
};

type CoverageSummary = {
  total: number;
  planned: number;
  introduced: number;
  checked: number;
  mastered: number;
  needsReview: number;
  gaps: CoverageGapSummary[];
};

type CoverageScopeTuple = {
  curriculumId: string | null;
  moduleId: string | null;
  objectiveListId: string | null;
  sessionPlanId: string | null;
};

type TutorSessionSummary = {
  id: string;
  status: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
};

export type NotebookStudyState = {
  studentProfile: {
    id: string;
    goalSummary: string | null;
    backgroundSummary: string | null;
    pacePreference: string | null;
    depthPreference: string | null;
    examplePreferencesJson: Record<string, unknown>;
    assessmentPreferenceJson: Record<string, unknown>;
    constraintsJson: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  } | null;
  curriculum: {
    id: string;
    title: string;
    status: string;
    activeModuleId: string | null;
  } | null;
  module: {
    id: string;
    title: string;
    summary: string | null;
    status: string;
  } | null;
  objectiveList: {
    id: string;
    title: string;
    status: string;
    currentObjectiveId: string | null;
    objectiveIdsOrdered: string[];
  } | null;
  sessionPlan: {
    id: string;
    title: string;
    status: string;
    sessionGoal: string | null;
    plannedObjectiveIds: string[];
    teachingArcIds: string[];
    teachingArcTitles: string[];
    teachingArcBlockTypes: string[];
  } | null;
  studyPlan: {
    id: string;
    title: string;
    status: string;
    activeSessionId?: string | null;
    currentObjective: StudyObjectiveSummary | null;
    upcomingObjectives: StudyObjectiveSummary[];
    completedObjectives: StudyObjectiveSummary[];
    weakConcepts: WeakConceptSummary[];
  } | null;
  tutorSession?: {
    active: TutorSessionSummary | null;
    last: TutorSessionSummary | null;
    canContinue: boolean;
    suggestedAction: "upload_sources" | "build_curriculum" | "continue_session" | "start_session" | "review_completed";
  };
  coverage: CoverageSummary;
  sourceLevels: SourceLevelRecord[];
  learnerReadiness: LearnerReadiness[];
  learnerProgressSummary: LearnerProgressSummary;
};

export function pickPreferredPlanningRow<T extends PlanningRow>(
  rows: T[],
  preferredId?: string | null,
): T | undefined {
  const orderedRows = [...rows].sort((left, right) => {
    const leftActive = left.status === "active" ? 1 : 0;
    const rightActive = right.status === "active" ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
  if (preferredId) {
    const preferredRow = orderedRows.find((row) => row.id === preferredId);
    if (preferredRow) return preferredRow;
  }
  return orderedRows[0];
}

export async function loadNotebookStudyState(
  dbClient: DbClient,
  notebookId: string,
  userId: string,
): Promise<NotebookStudyState> {
  const [studentProfile] = await dbClient.db
    .select({
      id: studentProfiles.id,
      goalSummary: studentProfiles.goalSummary,
      backgroundSummary: studentProfiles.backgroundSummary,
      pacePreference: studentProfiles.pacePreference,
      depthPreference: studentProfiles.depthPreference,
      examplePreferencesJson: studentProfiles.examplePreferencesJson,
      assessmentPreferenceJson: studentProfiles.assessmentPreferenceJson,
      constraintsJson: studentProfiles.constraintsJson,
      createdAt: studentProfiles.createdAt,
      updatedAt: studentProfiles.updatedAt,
    })
    .from(studentProfiles)
    .where(and(eq(studentProfiles.notebookId, notebookId), eq(studentProfiles.userId, userId)))
    .limit(1);

  const curriculumRows = await dbClient.db
    .select({
      id: curricula.id,
      title: curricula.title,
      status: curricula.status,
      activeModuleId: curricula.activeModuleId,
      updatedAt: curricula.updatedAt,
    })
    .from(curricula)
    .where(eq(curricula.notebookId, notebookId))
    .orderBy(desc(curricula.updatedAt))
    .limit(10);
  const curriculum = pickPreferredPlanningRow(curriculumRows);

  const moduleRows = await dbClient.db
    .select({
      id: curriculumModules.id,
      title: curriculumModules.title,
      summary: curriculumModules.summary,
      status: curriculumModules.status,
      updatedAt: curriculumModules.updatedAt,
    })
    .from(curriculumModules)
    .where(eq(curriculumModules.notebookId, notebookId))
    .orderBy(desc(curriculumModules.updatedAt))
    .limit(10);

  const moduleRow = pickPreferredPlanningRow(moduleRows, curriculum?.activeModuleId);

  const objectiveListRows = moduleRow
    ? await dbClient.db
        .select({
          id: objectiveLists.id,
          title: objectiveLists.title,
          status: objectiveLists.status,
          currentObjectiveId: objectiveLists.currentObjectiveId,
          objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered,
          updatedAt: objectiveLists.updatedAt,
        })
        .from(objectiveLists)
        .where(and(eq(objectiveLists.notebookId, notebookId), eq(objectiveLists.moduleId, moduleRow.id)))
        .orderBy(desc(objectiveLists.updatedAt))
        .limit(10)
    : [];

  const objectiveListRow = pickPreferredPlanningRow(objectiveListRows);

  const sessionPlanRows = objectiveListRow
    ? await dbClient.db
        .select({
          id: sessionPlans.id,
          title: sessionPlans.title,
          status: sessionPlans.status,
          sessionGoal: sessionPlans.sessionGoal,
          plannedObjectiveIds: sessionPlans.plannedObjectiveIds,
          teachingArcIds: sessionPlans.teachingArcIds,
          updatedAt: sessionPlans.updatedAt,
        })
        .from(sessionPlans)
        .where(and(eq(sessionPlans.notebookId, notebookId), eq(sessionPlans.objectiveListId, objectiveListRow.id)))
        .orderBy(desc(sessionPlans.updatedAt))
        .limit(10)
    : [];

  const sessionPlanRow = pickPreferredPlanningRow(sessionPlanRows);
  const teachingArcRows =
    sessionPlanRow && (sessionPlanRow.teachingArcIds ?? []).length > 0
      ? await dbClient.db
          .select({ id: artifacts.id, title: artifacts.title, payloadJson: artifacts.payloadJson })
          .from(artifacts)
          .where(and(eq(artifacts.notebookId, notebookId), inArray(artifacts.id, sessionPlanRow.teachingArcIds ?? [])))
      : [];
  const teachingArcTitleById = new Map(teachingArcRows.map((row) => [row.id, row.title]));
  const teachingArcBlockTypes = [
    ...new Set(
      teachingArcRows.flatMap((row) => {
        const blocks = row.payloadJson?.blocks;
        if (!Array.isArray(blocks)) return [];
        return blocks
          .map((block) => (typeof block === "object" && block && "type" in block ? (block as { type?: unknown }).type : null))
          .filter((type): type is string => typeof type === "string");
      }),
    ),
  ];

  const [studyPlan] = await dbClient.db
    .select({
      id: studyPlans.id,
      title: studyPlans.title,
      status: studyPlans.status,
      currentObjectiveId: studyPlans.currentObjectiveId,
      upcomingObjectiveIds: studyPlans.upcomingObjectiveIds,
      completedObjectiveIds: studyPlans.completedObjectiveIds,
      weakConceptIds: studyPlans.weakConceptIds,
      activeSessionId: studyPlans.activeSessionId,
    })
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, notebookId), eq(studyPlans.userId, userId)))
    .orderBy(desc(studyPlans.updatedAt))
    .limit(1);

  const coverage = await loadCoverageSummary(dbClient, notebookId, {
    curriculumId: curriculum?.id ?? null,
    moduleId: moduleRow?.id ?? null,
    objectiveListId: objectiveListRow?.id ?? null,
    sessionPlanId: sessionPlanRow?.id ?? null,
  });

  const levelSignals = await loadLevelSignals(
    dbClient,
    notebookId,
    userId,
    studentProfile,
    studyPlan?.weakConceptIds ?? [],
  );

  if (!studyPlan) {
    return withLearnerProgressSummary({
      studentProfile: studentProfile
        ? {
            id: studentProfile.id,
            goalSummary: studentProfile.goalSummary ?? null,
            backgroundSummary: studentProfile.backgroundSummary ?? null,
            pacePreference: studentProfile.pacePreference ?? null,
            depthPreference: studentProfile.depthPreference ?? null,
            examplePreferencesJson: studentProfile.examplePreferencesJson ?? {},
            assessmentPreferenceJson: studentProfile.assessmentPreferenceJson ?? {},
            constraintsJson: studentProfile.constraintsJson ?? {},
            createdAt: studentProfile.createdAt.toISOString(),
            updatedAt: studentProfile.updatedAt.toISOString(),
          }
        : null,
      curriculum: curriculum
        ? {
            id: curriculum.id,
            title: curriculum.title,
            status: curriculum.status,
            activeModuleId: curriculum.activeModuleId ?? null,
          }
        : null,
      module: moduleRow
        ? {
            id: moduleRow.id,
            title: moduleRow.title,
            summary: moduleRow.summary ?? null,
            status: moduleRow.status,
          }
        : null,
      objectiveList: objectiveListRow
        ? {
            id: objectiveListRow.id,
            title: objectiveListRow.title,
            status: objectiveListRow.status,
            currentObjectiveId: objectiveListRow.currentObjectiveId ?? null,
            objectiveIdsOrdered: objectiveListRow.objectiveIdsOrdered ?? [],
          }
        : null,
      sessionPlan: sessionPlanRow
        ? {
            id: sessionPlanRow.id,
            title: sessionPlanRow.title,
            status: sessionPlanRow.status,
            sessionGoal: sessionPlanRow.sessionGoal ?? null,
            plannedObjectiveIds: sessionPlanRow.plannedObjectiveIds ?? [],
            teachingArcIds: sessionPlanRow.teachingArcIds ?? [],
            teachingArcTitles: (sessionPlanRow.teachingArcIds ?? [])
              .map((id) => teachingArcTitleById.get(id))
              .filter((value): value is string => Boolean(value)),
            teachingArcBlockTypes,
          }
        : null,
      studyPlan: null,
      tutorSession: await loadTutorSessionSummary(dbClient, notebookId, userId, null, Boolean(curriculum)),
      coverage,
      ...levelSignals,
    });
  }

  const objectiveIds = [
    studyPlan.currentObjectiveId,
    ...(studyPlan.upcomingObjectiveIds ?? []),
    ...(studyPlan.completedObjectiveIds ?? []),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  const objectiveRows = objectiveIds.length
    ? await dbClient.db
        .select({
          id: objectives.id,
          title: objectives.title,
          status: objectives.status,
        })
        .from(objectives)
        .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.id, objectiveIds)))
    : [];

  const objectiveById = new Map(
    objectiveRows.map((row) => [
      row.id,
      {
        id: row.id,
        title: row.title,
        status: row.status,
      },
    ]),
  );

  const weakConceptIds = studyPlan.weakConceptIds ?? [];
  const weakConceptRows = weakConceptIds.length
    ? await dbClient.db
        .select({
          id: concepts.id,
          name: concepts.canonicalName,
        })
        .from(concepts)
        .where(and(eq(concepts.notebookId, notebookId), inArray(concepts.id, weakConceptIds)))
    : [];

  const weakConceptById = new Map(weakConceptRows.map((row) => [row.id, { id: row.id, name: row.name }]));

  return withLearnerProgressSummary({
    studentProfile: studentProfile
      ? {
          id: studentProfile.id,
          goalSummary: studentProfile.goalSummary ?? null,
          backgroundSummary: studentProfile.backgroundSummary ?? null,
          pacePreference: studentProfile.pacePreference ?? null,
          depthPreference: studentProfile.depthPreference ?? null,
          examplePreferencesJson: studentProfile.examplePreferencesJson ?? {},
          assessmentPreferenceJson: studentProfile.assessmentPreferenceJson ?? {},
          constraintsJson: studentProfile.constraintsJson ?? {},
          createdAt: studentProfile.createdAt.toISOString(),
          updatedAt: studentProfile.updatedAt.toISOString(),
        }
      : null,
    curriculum: curriculum
      ? {
          id: curriculum.id,
          title: curriculum.title,
          status: curriculum.status,
          activeModuleId: curriculum.activeModuleId ?? null,
        }
      : null,
    module: moduleRow
      ? {
          id: moduleRow.id,
          title: moduleRow.title,
          summary: moduleRow.summary ?? null,
          status: moduleRow.status,
        }
      : null,
    objectiveList: objectiveListRow
      ? {
          id: objectiveListRow.id,
          title: objectiveListRow.title,
          status: objectiveListRow.status,
          currentObjectiveId: objectiveListRow.currentObjectiveId ?? null,
          objectiveIdsOrdered: objectiveListRow.objectiveIdsOrdered ?? [],
        }
      : null,
    sessionPlan: sessionPlanRow
      ? {
          id: sessionPlanRow.id,
          title: sessionPlanRow.title,
          status: sessionPlanRow.status,
          sessionGoal: sessionPlanRow.sessionGoal ?? null,
          plannedObjectiveIds: sessionPlanRow.plannedObjectiveIds ?? [],
          teachingArcIds: sessionPlanRow.teachingArcIds ?? [],
          teachingArcTitles: (sessionPlanRow.teachingArcIds ?? [])
            .map((id) => teachingArcTitleById.get(id))
            .filter((value): value is string => Boolean(value)),
          teachingArcBlockTypes,
        }
      : null,
    studyPlan: {
      id: studyPlan.id,
      title: studyPlan.title,
      status: studyPlan.status,
      activeSessionId: studyPlan.activeSessionId ?? null,
      currentObjective: studyPlan.currentObjectiveId ? objectiveById.get(studyPlan.currentObjectiveId) ?? null : null,
      upcomingObjectives: (studyPlan.upcomingObjectiveIds ?? [])
        .map((id) => objectiveById.get(id))
        .filter((value): value is StudyObjectiveSummary => Boolean(value)),
      completedObjectives: (studyPlan.completedObjectiveIds ?? [])
        .map((id) => objectiveById.get(id))
        .filter((value): value is StudyObjectiveSummary => Boolean(value)),
      weakConcepts: weakConceptIds
        .map((id) => weakConceptById.get(id))
        .filter((value): value is WeakConceptSummary => Boolean(value)),
    },
    tutorSession: await loadTutorSessionSummary(dbClient, notebookId, userId, studyPlan.activeSessionId ?? null, Boolean(curriculum)),
    coverage,
    ...levelSignals,
  });
}

function withLearnerProgressSummary(
  state: Omit<NotebookStudyState, "learnerProgressSummary">,
): NotebookStudyState {
  return {
    ...state,
    learnerProgressSummary: deriveLearnerProgressSummary(state as NotebookStudyState),
  };
}

async function loadLevelSignals(
  dbClient: DbClient,
  notebookId: string,
  userId: string,
  studentProfile:
    | {
        id: string;
        backgroundSummary: string | null;
      }
    | undefined,
  weakConceptIds: string[],
): Promise<Pick<NotebookStudyState, "sourceLevels" | "learnerReadiness">> {
  const sourceRows = await dbClient.db
    .select({
      id: sources.id,
      title: sources.title,
      metadataJson: sources.metadataJson,
    })
    .from(sources)
    .where(eq(sources.notebookId, notebookId));

  const sourceLevels: SourceLevelRecord[] = sourceRows.map((row) => {
    const inferred = inferSourceLevelFromSignals({
      title: row.title,
      metadata: { ...(row.metadataJson ?? {}), sourceId: row.id },
      backgroundSummary: studentProfile?.backgroundSummary ?? null,
    });
    return {
      sourceId: row.id,
      level: inferred.level,
      confidence: inferred.confidence,
      lastUpdatedReason: inferred.lastUpdatedReason,
    };
  });

  const learningRows = await dbClient.db
    .select({
      conceptId: learningState.conceptId,
      masteryScore: learningState.masteryScore,
      confidence: learningState.confidence,
    })
    .from(learningState)
    .where(and(eq(learningState.notebookId, notebookId), eq(learningState.userId, userId)));

  const readinessByConcept = new Map(
    learningRows.map((row) => [
      row.conceptId,
      buildConceptLearnerReadiness({
        conceptId: row.conceptId,
        masteryScore: row.masteryScore,
        confidence: row.confidence,
      }),
    ]),
  );

  for (const conceptId of weakConceptIds) {
    if (readinessByConcept.has(conceptId)) continue;
    readinessByConcept.set(
      conceptId,
      buildConceptLearnerReadiness({
        conceptId,
        masteryScore: 0.2,
        confidence: null,
      }),
    );
  }

  const selfReported =
    studentProfile?.backgroundSummary && studentProfile.id
      ? buildSelfReportedLearnerReadiness({
          backgroundSummary: studentProfile.backgroundSummary,
          profileId: studentProfile.id,
        })
      : null;

  return {
    sourceLevels,
    learnerReadiness: [...(selfReported ? [selfReported] : []), ...readinessByConcept.values()],
  };
}

async function loadTutorSessionSummary(
  dbClient: DbClient,
  notebookId: string,
  userId: string,
  preferredSessionId: string | null,
  hasCurriculum: boolean,
): Promise<NonNullable<NotebookStudyState["tutorSession"]>> {
  const rows = await dbClient.db
    .select({
      id: tutorSessions.id,
      mode: tutorSessions.mode,
      status: tutorSessions.status,
      startedAt: tutorSessions.startedAt,
      endedAt: tutorSessions.endedAt,
    })
    .from(tutorSessions)
    .where(and(eq(tutorSessions.notebookId, notebookId), eq(tutorSessions.userId, userId)))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(10);

  const toSummary = (row: (typeof rows)[number]): TutorSessionSummary => ({
    id: row.id,
    mode: row.mode,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  });

  const activeRow =
    (preferredSessionId ? rows.find((row) => row.id === preferredSessionId && row.status !== "completed") : undefined) ??
    rows.find((row) => row.status === "active" || row.status === "paused") ??
    null;
  const lastRow = rows[0] ?? null;
  const active = activeRow ? toSummary(activeRow) : null;
  const last = lastRow ? toSummary(lastRow) : null;
  const canContinue = Boolean(active);
  const suggestedAction = !hasCurriculum
    ? "build_curriculum"
    : canContinue
      ? "continue_session"
      : last?.status === "completed"
        ? "review_completed"
        : "start_session";

  return { active, last, canContinue, suggestedAction };
}

async function loadCoverageSummary(
  dbClient: DbClient,
  notebookId: string,
  scope: CoverageScopeTuple,
): Promise<CoverageSummary> {
  const rows = await dbClient.db
    .select({
      coverageItemId: coverageItems.id,
      title: coverageItems.title,
      itemFamily: coverageItems.itemFamily,
      status: coverageRecords.status,
      curriculumId: coverageRecords.curriculumId,
      moduleId: coverageRecords.moduleId,
      objectiveListId: coverageRecords.objectiveListId,
      sessionPlanId: coverageRecords.sessionPlanId,
      updatedAt: coverageRecords.updatedAt,
    })
    .from(coverageItems)
    .leftJoin(
      coverageRecords,
      and(eq(coverageRecords.coverageItemId, coverageItems.id), eq(coverageRecords.notebookId, notebookId)),
    )
    .where(eq(coverageItems.notebookId, notebookId));

  const perItemRows = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = perItemRows.get(row.coverageItemId);
    if (existing) existing.push(row);
    else perItemRows.set(row.coverageItemId, [row]);
  }
  const scopedRows = [...perItemRows.values()]
    .map((itemRows) => selectPreferredCoverageRow(itemRows, scope))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const counts = { planned: 0, introduced: 0, checked: 0, mastered: 0, needsReview: 0 };
  const gaps: CoverageGapSummary[] = [];
  for (const row of scopedRows) {
    const status = row.status ?? "planned";
    if (status === "introduced") counts.introduced += 1;
    else if (status === "checked") counts.checked += 1;
    else if (status === "mastered") counts.mastered += 1;
    else if (status === "needs_review") counts.needsReview += 1;
    else counts.planned += 1;

    if ((status === "planned" || status === "needs_review") && gaps.length < 6) {
      gaps.push({ coverageItemId: row.coverageItemId, title: row.title, itemFamily: row.itemFamily, status });
    }
  }

  return { total: scopedRows.length, ...counts, gaps };
}

function normalizeScopeValue(value: string | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isScopeCompatible(row: CoverageScopeTuple, scope: CoverageScopeTuple): boolean {
  const dimensions: Array<keyof CoverageScopeTuple> = ["curriculumId", "moduleId", "objectiveListId", "sessionPlanId"];
  return dimensions.every((dimension) => {
    const rowValue = normalizeScopeValue(row[dimension]);
    const scopeValue = normalizeScopeValue(scope[dimension]);
    if (!scopeValue || !rowValue) return true;
    return rowValue === scopeValue;
  });
}

function scopeSpecificityScore(row: CoverageScopeTuple, scope: CoverageScopeTuple): number {
  if (normalizeScopeValue(scope.sessionPlanId) && normalizeScopeValue(row.sessionPlanId) === normalizeScopeValue(scope.sessionPlanId)) return 40;
  if (normalizeScopeValue(scope.objectiveListId) && normalizeScopeValue(row.objectiveListId) === normalizeScopeValue(scope.objectiveListId))
    return 30;
  if (normalizeScopeValue(scope.moduleId) && normalizeScopeValue(row.moduleId) === normalizeScopeValue(scope.moduleId)) return 20;
  if (normalizeScopeValue(scope.curriculumId) && normalizeScopeValue(row.curriculumId) === normalizeScopeValue(scope.curriculumId)) return 10;
  if (!normalizeScopeValue(row.curriculumId) && !normalizeScopeValue(row.moduleId) && !normalizeScopeValue(row.objectiveListId) && !normalizeScopeValue(row.sessionPlanId))
    return 1;
  return 0;
}

export function selectPreferredCoverageRow<T extends CoverageScopeTuple & { updatedAt: Date | null }>(
  rows: T[],
  scope: CoverageScopeTuple,
): T | null {
  const compatible = rows.filter((row) => isScopeCompatible(row, scope));
  if (compatible.length === 0) return null;
  return compatible.sort((left, right) => {
    const scoreDelta = scopeSpecificityScore(right, scope) - scopeSpecificityScore(left, scope);
    if (scoreDelta !== 0) return scoreDelta;
    return (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0);
  })[0]!;
}

export function formatStudyPlanSummary(state: NotebookStudyState): string | undefined {
  const curriculumBits = state.curriculum ? `${state.curriculum.title} (${state.curriculum.status})` : undefined;
  const moduleBits = state.module ? `module: ${state.module.title}` : undefined;
  const sessionBits = state.sessionPlan ? `session: ${state.sessionPlan.title}` : undefined;
  const plan = state.studyPlan;
  if (!plan) return undefined;

  const parts = [
    curriculumBits,
    moduleBits,
    sessionBits,
    `${plan.title} (${plan.status})`,
    plan.currentObjective ? `current: ${plan.currentObjective.title}` : undefined,
    plan.upcomingObjectives.length ? `next: ${plan.upcomingObjectives.slice(0, 2).map((item) => item.title).join(" | ")}` : undefined,
    plan.completedObjectives.length ? `${plan.completedObjectives.length} completed` : undefined,
  ].filter(Boolean);

  return parts.join("; ");
}

export function formatLearnerStateSummary(state: NotebookStudyState): string | undefined {
  const parts: string[] = [];

  if (state.studentProfile) {
    const profile = state.studentProfile;
    const profileBits = [
      profile.goalSummary ? `goal: ${profile.goalSummary}` : undefined,
      profile.pacePreference ? `pace: ${profile.pacePreference}` : undefined,
      profile.depthPreference ? `depth: ${profile.depthPreference}` : undefined,
    ].filter(Boolean);

    if (profileBits.length) {
      parts.push(`Student profile: ${profileBits.join("; ")}`);
    }

    // Include example preferences if available
    if (profile.examplePreferencesJson && Object.keys(profile.examplePreferencesJson).length > 0) {
      const examplePrefs = Object.entries(profile.examplePreferencesJson)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (examplePrefs) {
        parts.push(`Example preferences: ${examplePrefs}`);
      }
    }

    // Include assessment preferences if available
    if (profile.assessmentPreferenceJson && Object.keys(profile.assessmentPreferenceJson).length > 0) {
      const assessPrefs = Object.entries(profile.assessmentPreferenceJson)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (assessPrefs) {
        parts.push(`Assessment preferences: ${assessPrefs}`);
      }
    }

    // Include constraints if available
    if (profile.constraintsJson && Object.keys(profile.constraintsJson).length > 0) {
      const constraints = Object.entries(profile.constraintsJson)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (constraints) {
        parts.push(`Constraints: ${constraints}`);
      }
    }
  }

  const weakConcepts = state.studyPlan?.weakConcepts ?? [];
  if (weakConcepts.length) {
    parts.push(`Weak concepts: ${weakConcepts.slice(0, 4).map((concept) => concept.name).join(", ")}`);
  }

  const knownSourceLevels = (state.sourceLevels ?? []).filter((record) => record.level !== "unknown");
  if (knownSourceLevels.length) {
    parts.push(
      `Source levels: ${knownSourceLevels
        .slice(0, 3)
        .map((record) => `${record.sourceId}=${record.level}`)
        .join(", ")}`,
    );
  }

  const progress = state.learnerProgressSummary;
  if (progress?.headline) {
    parts.push(`Progress: ${progress.headline}`);
  } else if (progress?.weakConcepts.length) {
    parts.push(`Progress: focus on ${progress.weakConcepts.slice(0, 3).join(", ")}`);
  }

  return parts.length > 0 ? parts.join(" | ") : undefined;
}
