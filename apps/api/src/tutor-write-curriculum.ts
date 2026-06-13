import { and, eq, inArray } from "drizzle-orm";
import {
  curricula,
  curriculumModules,
  objectiveLists,
  objectives,
  sessionPlans,
} from "@studyagent/db";
import {
  buildReducerResult,
  type CurriculumActivateInput,
  type CurriculumActivateOutput,
  type ModuleUpdateInput,
  type ModuleUpdateOutput,
  type ObjectiveListMergeObjectivesInput,
  type ObjectiveListMergeObjectivesOutput,
  type ObjectiveListReorderInput,
  type ObjectiveListReorderOutput,
  type ObjectiveListSplitObjectiveInput,
  type ObjectiveListSplitObjectiveOutput,
  type ObjectiveListUpdateInput,
  type ObjectiveListUpdateOutput,
  type ObjectiveUpdateInput,
  type ObjectiveUpdateOutput,
  type RuntimeWriteToolProvider,
  type SessionPlanUpdateInput,
  type SessionPlanUpdateOutput,
} from "@studyagent/tools";
import { appendEventWithTutorCacheInvalidation as appendEvent } from "./agentic-cache-invalidation.js";
import type { AppContext } from "./context.js";
import { scheduleRollingModuleBuild } from "./rolling-module-build-scheduler.js";

async function activateCurriculumRecord(appCtx: AppContext, notebookId: string, input: CurriculumActivateInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(curricula)
    .where(and(eq(curricula.id, input.curriculumId), eq(curricula.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  const previousActiveModuleId = existing.activeModuleId;
  if (input.activeModuleId) {
    const [moduleRow] = await appCtx.db.db
      .select({ id: curriculumModules.id })
      .from(curriculumModules)
      .where(
        and(
          eq(curriculumModules.id, input.activeModuleId),
          eq(curriculumModules.notebookId, notebookId),
          eq(curriculumModules.curriculumId, existing.id),
        ),
      )
      .limit(1);
    if (!moduleRow) return null;
  }
  const updatedAt = new Date();
  const nextActiveModuleId = input.activeModuleId ?? existing.activeModuleId ?? null;
  await appCtx.db.db
    .update(curricula)
    .set({ status: "active", activeModuleId: nextActiveModuleId, updatedAt })
    .where(eq(curricula.id, existing.id));

  if (
    nextActiveModuleId &&
    previousActiveModuleId &&
    nextActiveModuleId !== previousActiveModuleId
  ) {
    const [previousModule] = await appCtx.db.db
      .select({ orderIndex: curriculumModules.orderIndex })
      .from(curriculumModules)
      .where(and(eq(curriculumModules.id, previousActiveModuleId), eq(curriculumModules.notebookId, notebookId)))
      .limit(1);
    const [nextModule] = await appCtx.db.db
      .select({ orderIndex: curriculumModules.orderIndex })
      .from(curriculumModules)
      .where(and(eq(curriculumModules.id, nextActiveModuleId), eq(curriculumModules.notebookId, notebookId)))
      .limit(1);
    if (
      previousModule &&
      nextModule &&
      nextModule.orderIndex > previousModule.orderIndex
    ) {
      scheduleRollingModuleBuild(appCtx.db, {
        notebookId,
        curriculumId: existing.id,
        completedModuleId: previousActiveModuleId,
        trigger: "learner_jump",
      });
    }
  }

  return { id: existing.id, notebookId: existing.notebookId, title: existing.title, status: "active", activeModuleId: nextActiveModuleId };
}

async function updateModuleRecord(appCtx: AppContext, notebookId: string, input: ModuleUpdateInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(curriculumModules)
    .where(and(eq(curriculumModules.id, input.moduleId), eq(curriculumModules.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  const updatedAt = new Date();
  const next = {
    title: input.title ?? existing.title,
    summary: input.summary ?? existing.summary ?? null,
    status: input.status ?? existing.status,
    orderIndex: input.orderIndex ?? existing.orderIndex,
    targetConceptIds: input.targetConceptIds ?? existing.targetConceptIds,
    prerequisiteModuleIds: input.prerequisiteModuleIds ?? existing.prerequisiteModuleIds,
    estimatedSessionCount: input.estimatedSessionCount ?? existing.estimatedSessionCount,
    coverageRequirementsJson: input.coverageRequirementsJson ?? existing.coverageRequirementsJson,
    masteryGateJson: input.masteryGateJson ?? existing.masteryGateJson,
    updatedAt,
  };
  await appCtx.db.db.update(curriculumModules).set(next).where(eq(curriculumModules.id, existing.id));

  if (input.requestDeepBuild && next.status === "active") {
    const [previousModule] = await appCtx.db.db
      .select({ id: curriculumModules.id })
      .from(curriculumModules)
      .where(
        and(
          eq(curriculumModules.notebookId, notebookId),
          eq(curriculumModules.curriculumId, existing.curriculumId),
          eq(curriculumModules.orderIndex, existing.orderIndex - 1),
        ),
      )
      .limit(1);
    if (previousModule) {
      scheduleRollingModuleBuild(appCtx.db, {
        notebookId,
        curriculumId: existing.curriculumId,
        completedModuleId: previousModule.id,
        trigger: "tutor_decision",
      });
    }
  }

  return { id: existing.id, notebookId: existing.notebookId, curriculumId: existing.curriculumId, title: next.title, summary: next.summary, status: next.status, orderIndex: next.orderIndex };
}

async function updateObjectiveListRecord(appCtx: AppContext, notebookId: string, input: ObjectiveListUpdateInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.id, input.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  const updatedAt = new Date();
  const objectiveIdsOrdered = input.objectiveIdsOrdered ?? existing.objectiveIdsOrdered;
  const currentObjectiveId = input.currentObjectiveId === undefined ? existing.currentObjectiveId ?? null : input.currentObjectiveId;
  if (currentObjectiveId && !objectiveIdsOrdered.includes(currentObjectiveId)) {
    return null;
  }
  if (objectiveIdsOrdered.length > 0) {
    const objectiveRows = await appCtx.db.db
      .select({ id: objectives.id })
      .from(objectives)
      .where(
        and(
          eq(objectives.notebookId, notebookId),
          eq(objectives.curriculumId, existing.curriculumId),
          inArray(objectives.id, objectiveIdsOrdered),
        ),
      );
    if (objectiveRows.length !== objectiveIdsOrdered.length) {
      return null;
    }
  }
  const next = {
    title: input.title ?? existing.title,
    status: input.status ?? existing.status,
    currentObjectiveId,
    objectiveIdsOrdered,
    coverageSnapshotJson: input.coverageSnapshotJson ?? existing.coverageSnapshotJson,
    updatedAt,
  };
  await appCtx.db.db.update(objectiveLists).set(next).where(eq(objectiveLists.id, existing.id));
  return { id: existing.id, notebookId: existing.notebookId, curriculumId: existing.curriculumId, moduleId: existing.moduleId, title: next.title, status: next.status, currentObjectiveId: next.currentObjectiveId, objectiveIdsOrdered: next.objectiveIdsOrdered };
}

async function updateObjectiveRecord(appCtx: AppContext, notebookId: string, input: ObjectiveUpdateInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, input.objectiveId), eq(objectives.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  const updatedAt = new Date();
  const next = {
    title: input.title ?? existing.title,
    status: input.status ?? existing.status,
    targetConceptIds: input.targetConceptIds ?? existing.targetConceptIds,
    prerequisiteConceptIds: input.prerequisiteConceptIds ?? existing.prerequisiteConceptIds,
    successCriteriaJson: input.successCriteriaJson ?? existing.successCriteriaJson,
    sourceRefsJson: input.sourceRefsJson ?? existing.sourceRefsJson,
    suggestedMode: input.suggestedMode === undefined ? existing.suggestedMode : input.suggestedMode,
    readinessScore: input.readinessScore === undefined ? existing.readinessScore : input.readinessScore,
    updatedAt,
  };
  await appCtx.db.db.update(objectives).set(next).where(eq(objectives.id, existing.id));
  return { id: existing.id, notebookId: existing.notebookId, curriculumId: existing.curriculumId, title: next.title, status: next.status, orderIndex: existing.orderIndex };
}

async function reorderObjectiveListRecord(appCtx: AppContext, notebookId: string, input: ObjectiveListReorderInput) {
  const [existing] = await appCtx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.id, input.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  const currentSet = [...(existing.objectiveIdsOrdered ?? [])].sort();
  const incomingSet = [...input.objectiveIdsOrdered].sort();
  if (JSON.stringify(currentSet) !== JSON.stringify(incomingSet)) return null;
  if (input.currentObjectiveId && !input.objectiveIdsOrdered.includes(input.currentObjectiveId)) return null;
  const currentObjectiveId = input.currentObjectiveId === undefined ? existing.currentObjectiveId ?? null : input.currentObjectiveId;
  const updatedAt = new Date();
  await appCtx.db.db
    .update(objectiveLists)
    .set({ objectiveIdsOrdered: input.objectiveIdsOrdered, currentObjectiveId, updatedAt })
    .where(eq(objectiveLists.id, existing.id));
  return { id: existing.id, notebookId: existing.notebookId, curriculumId: existing.curriculumId, moduleId: existing.moduleId, title: existing.title, status: existing.status, currentObjectiveId, objectiveIdsOrdered: input.objectiveIdsOrdered };
}

async function splitObjectiveRecord(appCtx: AppContext, notebookId: string, input: ObjectiveListSplitObjectiveInput) {
  const [list] = await appCtx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.id, input.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
    .limit(1);
  if (!list) return null;
  const splitIndex = list.objectiveIdsOrdered.indexOf(input.objectiveId);
  if (splitIndex < 0) return null;

  const [sourceObjective] = await appCtx.db.db
    .select()
    .from(objectives)
    .where(and(eq(objectives.id, input.objectiveId), eq(objectives.notebookId, notebookId)))
    .limit(1);
  if (!sourceObjective) return null;

  const createdObjectiveIds: string[] = [];
  for (let i = 0; i < input.splitObjectives.length; i += 1) {
    const split = input.splitObjectives[i]!;
    const id = `objective_${crypto.randomUUID().replaceAll("-", "")}`;
    createdObjectiveIds.push(id);
    await appCtx.db.db.insert(objectives).values({
      id,
      notebookId,
      curriculumId: sourceObjective.curriculumId,
      title: split.title,
      status: "not_started",
      orderIndex: sourceObjective.orderIndex + i,
      prerequisiteConceptIds: split.prerequisiteConceptIds ?? sourceObjective.prerequisiteConceptIds,
      targetConceptIds: split.targetConceptIds ?? sourceObjective.targetConceptIds,
      successCriteriaJson: sourceObjective.successCriteriaJson,
      sourceRefsJson: sourceObjective.sourceRefsJson,
      suggestedMode: sourceObjective.suggestedMode,
      readinessScore: sourceObjective.readinessScore,
    });
  }

  await appCtx.db.db.update(objectives).set({ status: "superseded", updatedAt: new Date() }).where(eq(objectives.id, sourceObjective.id));
  const objectiveIdsOrdered = [...list.objectiveIdsOrdered];
  objectiveIdsOrdered.splice(splitIndex, 1, ...createdObjectiveIds);
  const currentObjectiveId = list.currentObjectiveId === input.objectiveId ? createdObjectiveIds[0] ?? null : list.currentObjectiveId ?? null;
  await appCtx.db.db
    .update(objectiveLists)
    .set({ objectiveIdsOrdered, currentObjectiveId, updatedAt: new Date() })
    .where(eq(objectiveLists.id, list.id));
  return {
    objectiveList: { id: list.id, notebookId: list.notebookId, curriculumId: list.curriculumId, moduleId: list.moduleId, title: list.title, status: list.status, currentObjectiveId, objectiveIdsOrdered },
    createdObjectiveIds,
  };
}

async function mergeObjectivesRecord(appCtx: AppContext, notebookId: string, input: ObjectiveListMergeObjectivesInput) {
  const [list] = await appCtx.db.db
    .select()
    .from(objectiveLists)
    .where(and(eq(objectiveLists.id, input.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
    .limit(1);
  if (!list) return null;
  if (!input.objectiveIds.every((id) => list.objectiveIdsOrdered.includes(id))) return null;

  const rows = await appCtx.db.db
    .select()
    .from(objectives)
    .where(and(eq(objectives.notebookId, notebookId), inArray(objectives.id, input.objectiveIds)));
  if (rows.length !== input.objectiveIds.length) return null;

  const mergedObjectiveId = `objective_${crypto.randomUUID().replaceAll("-", "")}`;
  const first = rows[0]!;
  await appCtx.db.db.insert(objectives).values({
    id: mergedObjectiveId,
    notebookId,
    curriculumId: first.curriculumId,
    title: input.mergedObjectiveTitle,
    status: "not_started",
    orderIndex: Math.min(...rows.map((row) => row.orderIndex)),
    prerequisiteConceptIds: input.prerequisiteConceptIds ?? first.prerequisiteConceptIds,
    targetConceptIds: input.targetConceptIds ?? first.targetConceptIds,
    successCriteriaJson: first.successCriteriaJson,
    sourceRefsJson: first.sourceRefsJson,
    suggestedMode: first.suggestedMode,
    readinessScore: first.readinessScore,
  });

  await appCtx.db.db.update(objectives).set({ status: "merged", updatedAt: new Date() }).where(inArray(objectives.id, input.objectiveIds));

  const objectiveIdsOrdered = list.objectiveIdsOrdered.filter((id) => !input.objectiveIds.includes(id));
  let insertAt = list.objectiveIdsOrdered.length;
  for (let i = 0; i < list.objectiveIdsOrdered.length; i += 1) {
    if (input.objectiveIds.includes(list.objectiveIdsOrdered[i]!)) {
      insertAt = i;
      break;
    }
  }
  objectiveIdsOrdered.splice(insertAt, 0, mergedObjectiveId);
  const currentObjectiveId = list.currentObjectiveId && input.objectiveIds.includes(list.currentObjectiveId) ? mergedObjectiveId : list.currentObjectiveId ?? null;
  await appCtx.db.db
    .update(objectiveLists)
    .set({ objectiveIdsOrdered, currentObjectiveId, updatedAt: new Date() })
    .where(eq(objectiveLists.id, list.id));
  return {
    objectiveList: { id: list.id, notebookId: list.notebookId, curriculumId: list.curriculumId, moduleId: list.moduleId, title: list.title, status: list.status, currentObjectiveId, objectiveIdsOrdered },
    mergedObjectiveId,
  };
}

async function updateSessionPlanRecord(
  appCtx: AppContext,
  notebookId: string,
  input: SessionPlanUpdateInput,
): Promise<
  | {
      id: string;
      notebookId: string;
      curriculumId: string;
      moduleId: string;
      objectiveListId: string;
      title: string;
      status: string;
      sessionGoal: string | null;
      plannedObjectiveIds: string[];
      openerJson: Record<string, unknown>;
      diagnosticQuestionIds: string[];
      teachingArcIds: string[];
      artifactRefsJson: unknown[];
      exitCriteriaJson: Record<string, unknown>;
      recommendationReasonJson: Record<string, unknown>;
      createdByRunId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }
  | null
> {
  const [existing] = await appCtx.db.db
    .select()
    .from(sessionPlans)
    .where(and(eq(sessionPlans.id, input.sessionPlanId), eq(sessionPlans.notebookId, notebookId)))
    .limit(1);
  if (!existing) return null;
  if (input.plannedObjectiveIds) {
    const [objectiveList] = await appCtx.db.db
      .select({ objectiveIdsOrdered: objectiveLists.objectiveIdsOrdered })
      .from(objectiveLists)
      .where(and(eq(objectiveLists.id, existing.objectiveListId), eq(objectiveLists.notebookId, notebookId)))
      .limit(1);
    if (!objectiveList) return null;
    const allowed = new Set(objectiveList.objectiveIdsOrdered ?? []);
    if (input.plannedObjectiveIds.some((id) => !allowed.has(id))) {
      return null;
    }
  }

  const updatedAt = new Date();
  const next = {
    title: input.title ?? existing.title,
    status: input.status ?? existing.status,
    sessionGoal: input.sessionGoal ?? existing.sessionGoal ?? null,
    plannedObjectiveIds: input.plannedObjectiveIds ?? existing.plannedObjectiveIds,
    openerJson: input.openerJson ?? existing.openerJson,
    diagnosticQuestionIds: input.diagnosticQuestionIds ?? existing.diagnosticQuestionIds,
    teachingArcIds: input.teachingArcIds ?? existing.teachingArcIds,
    artifactRefsJson: input.artifactRefsJson ?? existing.artifactRefsJson,
    exitCriteriaJson: input.exitCriteriaJson ?? existing.exitCriteriaJson,
    recommendationReasonJson: input.recommendationReasonJson ?? existing.recommendationReasonJson,
    updatedAt,
  };

  await appCtx.db.db.update(sessionPlans).set(next).where(eq(sessionPlans.id, existing.id));
  return { ...existing, ...next };
}

export function createCurriculumWriteHandlers(appCtx: AppContext): Pick<
  RuntimeWriteToolProvider,
  | "updateSessionPlan"
  | "activateCurriculum"
  | "updateModule"
  | "updateObjectiveList"
  | "updateObjective"
  | "reorderObjectiveList"
  | "splitObjective"
  | "mergeObjectives"
> {
  return {
    async updateSessionPlan(input, ctx): Promise<SessionPlanUpdateOutput> {
      const result = await updateSessionPlanRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "session_plan.updated",
            payload: {
              sessionPlanId: result.id,
              curriculumId: result.curriculumId,
              moduleId: result.moduleId,
              objectiveListId: result.objectiveListId,
              title: result.title,
              status: result.status,
              sessionGoal: result.sessionGoal,
              plannedObjectiveIds: result.plannedObjectiveIds,
              traceId: ctx.traceId,
            },
          })
        : null;
      return {
        sessionPlan: result
          ? {
              id: result.id,
              notebookId: result.notebookId,
              curriculumId: result.curriculumId,
              moduleId: result.moduleId,
              objectiveListId: result.objectiveListId,
              title: result.title,
              status: result.status,
              sessionGoal: result.sessionGoal,
              plannedObjectiveIds: result.plannedObjectiveIds,
              openerJson: result.openerJson,
              diagnosticQuestionIds: result.diagnosticQuestionIds,
              teachingArcIds: result.teachingArcIds,
              artifactRefsJson: result.artifactRefsJson,
              exitCriteriaJson: result.exitCriteriaJson,
              recommendationReasonJson: result.recommendationReasonJson,
              createdByRunId: result.createdByRunId,
              createdAt: result.createdAt.toISOString(),
              updatedAt: result.updatedAt.toISOString(),
            }
          : null,
        warnings: result ? [] : [{ code: "session_plan_missing", message: "Session plan was not found in this notebook." }],
        reducerResult: buildReducerResult(
          "session_plan.updated",
          {
            notebookId: ctx.notebookId,
            sessionPlanId: input.sessionPlanId,
            title: input.title ?? null,
            status: input.status ?? null,
            sessionGoal: input.sessionGoal ?? null,
            plannedObjectiveIds: input.plannedObjectiveIds ?? [],
            openerJson: input.openerJson ?? {},
            diagnosticQuestionIds: input.diagnosticQuestionIds ?? [],
            teachingArcIds: input.teachingArcIds ?? [],
            artifactRefsJson: input.artifactRefsJson ?? [],
            exitCriteriaJson: input.exitCriteriaJson ?? {},
            recommendationReasonJson: input.recommendationReasonJson ?? {},
          },
          event ? [event.id] : [],
        ),
      };
    },

    async activateCurriculum(input, ctx): Promise<CurriculumActivateOutput> {
      const result = await activateCurriculumRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "curriculum.activated",
            payload: { curriculumId: result.id, activeModuleId: result.activeModuleId, reasonJson: input.reasonJson, traceId: ctx.traceId },
          })
        : null;
      return {
        curriculum: result,
        warnings: result ? [] : [{ code: "curriculum_missing", message: "Curriculum was not found in this notebook." }],
        reducerResult: buildReducerResult("curriculum.activated", { notebookId: ctx.notebookId, curriculumId: input.curriculumId, activeModuleId: input.activeModuleId ?? null, reasonJson: input.reasonJson }, event ? [event.id] : []),
      };
    },

    async updateModule(input, ctx): Promise<ModuleUpdateOutput> {
      const result = await updateModuleRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "module.updated",
            payload: { moduleId: result.id, curriculumId: result.curriculumId, title: result.title, status: result.status, orderIndex: result.orderIndex, traceId: ctx.traceId },
          })
        : null;
      return {
        module: result,
        warnings: result ? [] : [{ code: "module_missing", message: "Module was not found in this notebook." }],
        reducerResult: buildReducerResult("module.updated", { notebookId: ctx.notebookId, moduleId: input.moduleId, title: input.title ?? null, status: input.status ?? null, orderIndex: input.orderIndex ?? null }, event ? [event.id] : []),
      };
    },

    async updateObjectiveList(input, ctx): Promise<ObjectiveListUpdateOutput> {
      const result = await updateObjectiveListRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective_list.updated",
            payload: { objectiveListId: result.id, currentObjectiveId: result.currentObjectiveId, objectiveIdsOrdered: result.objectiveIdsOrdered, traceId: ctx.traceId },
          })
        : null;
      return {
        objectiveList: result,
        warnings: result ? [] : [{ code: "objective_list_missing", message: "Objective list was not found in this notebook." }],
        reducerResult: buildReducerResult("objective_list.updated", { notebookId: ctx.notebookId, objectiveListId: input.objectiveListId, currentObjectiveId: input.currentObjectiveId ?? null, objectiveIdsOrdered: input.objectiveIdsOrdered ?? [] }, event ? [event.id] : []),
      };
    },

    async updateObjective(input, ctx): Promise<ObjectiveUpdateOutput> {
      const hasMutation =
        input.title !== undefined
        || input.status !== undefined
        || input.targetConceptIds !== undefined
        || input.prerequisiteConceptIds !== undefined
        || input.successCriteriaJson !== undefined
        || input.sourceRefsJson !== undefined
        || input.suggestedMode !== undefined
        || input.readinessScore !== undefined;
      if (!hasMutation) {
        return {
          objective: null,
          warnings: [{
            code: "objective_noop",
            message: "objective.update requires at least one field to change, such as status, title, targetConceptIds, or readinessScore.",
          }],
          reducerResult: buildReducerResult("objective.updated", {
            notebookId: ctx.notebookId,
            objectiveId: input.objectiveId,
            title: null,
            status: null,
            rejectedReason: "no_mutable_fields",
          }),
        };
      }
      const result = await updateObjectiveRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective.updated",
            payload: { objectiveId: result.id, title: result.title, status: result.status, orderIndex: result.orderIndex, traceId: ctx.traceId },
          })
        : null;
      return {
        objective: result,
        warnings: result ? [] : [{ code: "objective_missing", message: "Objective was not found in this notebook." }],
        reducerResult: buildReducerResult("objective.updated", { notebookId: ctx.notebookId, objectiveId: input.objectiveId, title: input.title ?? null, status: input.status ?? null }, event ? [event.id] : []),
      };
    },

    async reorderObjectiveList(input, ctx): Promise<ObjectiveListReorderOutput> {
      const result = await reorderObjectiveListRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective_list.reordered",
            payload: { objectiveListId: result.id, currentObjectiveId: result.currentObjectiveId, objectiveIdsOrdered: result.objectiveIdsOrdered, traceId: ctx.traceId },
          })
        : null;
      return {
        objectiveList: result,
        warnings: result ? [] : [{ code: "objective_list_reorder_rejected", message: "Objective list reorder failed due to scope or ordering mismatch." }],
        reducerResult: buildReducerResult("objective_list.reordered", { notebookId: ctx.notebookId, objectiveListId: input.objectiveListId, objectiveIdsOrdered: input.objectiveIdsOrdered, currentObjectiveId: input.currentObjectiveId ?? null }, event ? [event.id] : []),
      };
    },

    async splitObjective(input, ctx): Promise<ObjectiveListSplitObjectiveOutput> {
      const result = await splitObjectiveRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective_list.objective_split",
            payload: { objectiveListId: input.objectiveListId, objectiveId: input.objectiveId, createdObjectiveIds: result.createdObjectiveIds, traceId: ctx.traceId },
          })
        : null;
      return {
        objectiveList: result?.objectiveList ?? null,
        createdObjectiveIds: result?.createdObjectiveIds ?? [],
        warnings: result ? [] : [{ code: "objective_split_rejected", message: "Objective split failed due to scope or missing objective." }],
        reducerResult: buildReducerResult("objective_list.objective_split", { notebookId: ctx.notebookId, objectiveListId: input.objectiveListId, objectiveId: input.objectiveId, splitObjectives: input.splitObjectives }, event ? [event.id] : []),
      };
    },

    async mergeObjectives(input, ctx): Promise<ObjectiveListMergeObjectivesOutput> {
      const result = await mergeObjectivesRecord(appCtx, ctx.notebookId, input);
      const event = result
        ? await appendEvent(appCtx.db, {
            notebookId: ctx.notebookId,
            runId: ctx.runId,
            ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
            eventType: "objective_list.objectives_merged",
            payload: { objectiveListId: input.objectiveListId, objectiveIds: input.objectiveIds, mergedObjectiveId: result.mergedObjectiveId, traceId: ctx.traceId },
          })
        : null;
      return {
        objectiveList: result?.objectiveList ?? null,
        mergedObjectiveId: result?.mergedObjectiveId,
        warnings: result ? [] : [{ code: "objective_merge_rejected", message: "Objective merge failed due to scope or missing objectives." }],
        reducerResult: buildReducerResult("objective_list.objectives_merged", { notebookId: ctx.notebookId, objectiveListId: input.objectiveListId, objectiveIds: input.objectiveIds, mergedObjectiveTitle: input.mergedObjectiveTitle }, event ? [event.id] : []),
      };
    },
  };
}
