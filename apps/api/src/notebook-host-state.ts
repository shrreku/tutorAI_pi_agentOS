import type { DbClient } from "@studyagent/db";
import { loadNotebookStudyState } from "./study-state.js";
import type { NotebookStudyState } from "./study-state.js";

export { NotebookStudyState, loadNotebookStudyState };

export async function loadNotebookHostState(
  dbClient: DbClient,
  notebookId: string,
  userId: string,
) {
  const studyState = await loadNotebookStudyState(dbClient, notebookId, userId);

  const planning = {
    curriculum: studyState.curriculum,
    module: studyState.module,
    objectiveList: studyState.objectiveList,
    sessionPlan: studyState.sessionPlan,
    studyPlan: studyState.studyPlan,
  };

  const mastery = {
    coverage: studyState.coverage,
    sourceLevels: studyState.sourceLevels,
    learnerReadiness: studyState.learnerReadiness,
    learnerProgressSummary: studyState.learnerProgressSummary,
  };

  const session = {
    tutorSession: studyState.tutorSession,
    studentProfile: studyState.studentProfile,
  };

  const personalization = {
    weakConcepts: studyState.studyPlan?.weakConcepts ?? [],
  };

  return { studyState, planning, mastery, session, personalization };
}

export function buildHostStateSignatureInput(studyState: NotebookStudyState) {
  return {
    planning: {
      studyPlanId: studyState.studyPlan?.id ?? null,
      sessionPlanId: studyState.sessionPlan?.id ?? null,
      objectiveListId: studyState.objectiveList?.id ?? null,
      moduleId: studyState.module?.id ?? null,
      curriculumId: studyState.curriculum?.id ?? null,
    },
    mastery: {
      weakConcepts: studyState.studyPlan?.weakConcepts?.map((c) => c.name) ?? [],
    },
    session: {
      activeSessionId: studyState.studyPlan?.activeSessionId ?? null,
    },
    personalization: {
      studentProfileId: studyState.studentProfile?.id ?? null,
    },
  };
}

