import { and, eq, inArray } from "drizzle-orm";
import {
  concepts,
  curricula,
  curriculumModules,
  objectiveLists,
  objectives,
  sessionPlans,
  studentProfiles,
  studyPlans,
  type DbClient,
} from "@studyagent/db";

type StudyObjectiveSummary = {
  id: string;
  title: string;
  status: string;
};

type WeakConceptSummary = {
  id: string;
  name: string;
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
  } | null;
  studyPlan: {
    id: string;
    title: string;
    status: string;
    currentObjective: StudyObjectiveSummary | null;
    upcomingObjectives: StudyObjectiveSummary[];
    completedObjectives: StudyObjectiveSummary[];
    weakConcepts: WeakConceptSummary[];
  } | null;
};

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

  const [curriculum] = await dbClient.db
    .select({
      id: curricula.id,
      title: curricula.title,
      status: curricula.status,
      activeModuleId: curricula.activeModuleId,
    })
    .from(curricula)
    .where(eq(curricula.notebookId, notebookId))
    .orderBy(curricula.updatedAt)
    .limit(1);

  const [moduleRow] = curriculum?.activeModuleId
    ? await dbClient.db
        .select({
          id: curriculumModules.id,
          title: curriculumModules.title,
          summary: curriculumModules.summary,
          status: curriculumModules.status,
        })
        .from(curriculumModules)
        .where(and(eq(curriculumModules.notebookId, notebookId), eq(curriculumModules.id, curriculum.activeModuleId)))
        .limit(1)
    : await dbClient.db
        .select({
          id: curriculumModules.id,
          title: curriculumModules.title,
          summary: curriculumModules.summary,
          status: curriculumModules.status,
        })
        .from(curriculumModules)
        .where(eq(curriculumModules.notebookId, notebookId))
        .orderBy(curriculumModules.orderIndex)
        .limit(1);

  const [objectiveListRow] = moduleRow
    ? await dbClient.db
        .select({
          id: objectiveLists.id,
          title: objectiveLists.title,
          status: objectiveLists.status,
          currentObjectiveId: objectiveLists.currentObjectiveId,
          objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered,
        })
        .from(objectiveLists)
        .where(and(eq(objectiveLists.notebookId, notebookId), eq(objectiveLists.moduleId, moduleRow.id)))
        .orderBy(objectiveLists.updatedAt)
        .limit(1)
    : [];

  const [sessionPlanRow] = objectiveListRow
    ? await dbClient.db
        .select({
          id: sessionPlans.id,
          title: sessionPlans.title,
          status: sessionPlans.status,
          sessionGoal: sessionPlans.sessionGoal,
          plannedObjectiveIds: sessionPlans.plannedObjectiveIds,
        })
        .from(sessionPlans)
        .where(and(eq(sessionPlans.notebookId, notebookId), eq(sessionPlans.objectiveListId, objectiveListRow.id)))
        .orderBy(sessionPlans.updatedAt)
        .limit(1)
    : [];

  const [studyPlan] = await dbClient.db
    .select({
      id: studyPlans.id,
      title: studyPlans.title,
      status: studyPlans.status,
      currentObjectiveId: studyPlans.currentObjectiveId,
      upcomingObjectiveIds: studyPlans.upcomingObjectiveIds,
      completedObjectiveIds: studyPlans.completedObjectiveIds,
      weakConceptIds: studyPlans.weakConceptIds,
    })
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, notebookId), eq(studyPlans.userId, userId)))
    .limit(1);

  if (!studyPlan) {
    return {
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
          }
        : null,
      studyPlan: null,
    };
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

  return {
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
        }
      : null,
    studyPlan: {
      id: studyPlan.id,
      title: studyPlan.title,
      status: studyPlan.status,
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
  };
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
  if (state.studentProfile) {
    const profileBits = [
      state.studentProfile.goalSummary ? `goal: ${state.studentProfile.goalSummary}` : undefined,
      state.studentProfile.pacePreference ? `pace: ${state.studentProfile.pacePreference}` : undefined,
      state.studentProfile.depthPreference ? `depth: ${state.studentProfile.depthPreference}` : undefined,
    ].filter(Boolean);
    if (profileBits.length) {
      return profileBits.join("; ");
    }
  }

  const weakConcepts = state.studyPlan?.weakConcepts ?? [];
  if (!weakConcepts.length) return undefined;
  return `Weak concepts: ${weakConcepts.slice(0, 4).map((concept) => concept.name).join(", ")}`;
}
