import { eq } from "drizzle-orm";
import { sources } from "@studyagent/db";
import type {
  DashboardActionTarget,
  DashboardSurface,
  NotebookWorkspaceBootstrap,
} from "@studyagent/schemas";
import {
  buildNotebookWorkspaceHref,
  dashboardActionTargetSchema,
  notebookWorkspaceBootstrapSchema,
  parseDashboardActionTargetFromSearch,
  resolveSourceReadiness,
} from "@studyagent/schemas";
import type { AppContext } from "./context.js";
import { resolveIngestionStatus } from "./hosted-beta/ingestion-status.js";
import type { OwnedNotebookContext } from "./hosted-beta/notebook-context.js";
import { loadNotebookStudyState, type NotebookStudyState } from "./study-state.js";

function summarizeSources(
  rows: Array<{ status: string; metadataJson: Record<string, unknown> | null }>,
) {
  const summary = { total: rows.length, ready: 0, processing: 0, failed: 0 };
  for (const row of rows) {
    const readiness = resolveSourceReadiness({
      status: row.status,
      metadataJson: row.metadataJson,
    });
    const ingestion = resolveIngestionStatus({
      status: row.status,
      metadataJson: row.metadataJson,
    });
    if (readiness.tutoring.ready || ingestion.ready) {
      summary.ready += 1;
    } else if (ingestion.failed) {
      summary.failed += 1;
    } else {
      summary.processing += 1;
    }
  }
  return summary;
}

function computeStudyProgress(studyState: NotebookStudyState): number {
  const { coverage } = studyState;
  if (coverage.total > 0) {
    return Math.round((coverage.mastered / coverage.total) * 100);
  }
  const completedObjectives = studyState.studyPlan?.completedObjectives.length ?? 0;
  const upcomingObjectives = studyState.studyPlan?.upcomingObjectives.length ?? 0;
  const currentObjective = studyState.studyPlan?.currentObjective ? 1 : 0;
  const objectiveTotal = completedObjectives + upcomingObjectives + currentObjective;
  if (objectiveTotal > 0) {
    return Math.round((completedObjectives / objectiveTotal) * 100);
  }
  return 0;
}

function buildStudySummary(studyState: NotebookStudyState) {
  const hasCurriculum = Boolean(studyState.curriculum);
  const hasSessionPlan = Boolean(studyState.sessionPlan);
  const status = !hasCurriculum && !hasSessionPlan ? "empty" : hasCurriculum ? "ready" : "building";

  return {
    status,
    curriculumTitle: studyState.curriculum?.title ?? null,
    moduleTitle: studyState.module?.title ?? null,
    objectiveTitle: studyState.studyPlan?.currentObjective?.title ?? null,
    progressPercent: computeStudyProgress(studyState),
    activeSessionId: studyState.tutorSession?.active?.id ?? studyState.studyPlan?.activeSessionId ?? null,
    canContinueSession: Boolean(studyState.tutorSession?.canContinue),
  };
}

function deriveAllowedSurfaces(studyState: NotebookStudyState): DashboardSurface[] {
  const surfaces = new Set<DashboardSurface>(["tutor"]);
  if (studyState.curriculum) {
    surfaces.add("study_map");
  }
  if (studyState.studyPlan?.currentObjective || studyState.module) {
    surfaces.add("reading");
  }
  if (studyState.coverage.total > 0 || (studyState.studyPlan?.weakConcepts.length ?? 0) > 0) {
    surfaces.add("practice");
  }
  if (studyState.sessionPlan) {
    surfaces.add("interactive");
    surfaces.add("app");
  }
  return [...surfaces];
}

function defaultActionTarget(studyState: NotebookStudyState): DashboardActionTarget {
  const tutor = studyState.tutorSession;
  if (tutor?.canContinue && tutor.active) {
    return {
      surface: "tutor",
      intent: "resume",
      sessionId: tutor.active.id,
    };
  }
  if (studyState.studyPlan?.currentObjective) {
    return {
      surface: "reading",
      intent: "continue",
      nodeRef: {
        refType: "objective",
        refId: studyState.studyPlan.currentObjective.id,
        title: studyState.studyPlan.currentObjective.title,
      },
    };
  }
  if (studyState.curriculum) {
    return { surface: "study_map", intent: "continue" };
  }
  return { surface: "tutor", intent: "continue" };
}

function normalizeActionTarget(
  requested: DashboardActionTarget | null,
  studyState: NotebookStudyState,
  allowedSurfaces: DashboardSurface[],
): { target: DashboardActionTarget; fallbackReason: string | null } {
  const fallback = defaultActionTarget(studyState);
  if (!requested) {
    return { target: fallback, fallbackReason: null };
  }

  const parsed = dashboardActionTargetSchema.safeParse(requested);
  if (!parsed.success) {
    return { target: fallback, fallbackReason: "The requested workspace target was invalid." };
  }

  const target = parsed.data;
  if (!allowedSurfaces.includes(target.surface)) {
    return {
      target: fallback,
      fallbackReason: `The ${target.surface.replace(/_/g, " ")} surface is not ready yet.`,
    };
  }

  if (target.sessionId) {
    const activeId = studyState.tutorSession?.active?.id;
    const lastId = studyState.tutorSession?.last?.id;
    if (target.sessionId !== activeId && target.sessionId !== lastId) {
      return {
        target: fallback,
        fallbackReason: "That tutor session is no longer available.",
      };
    }
  }

  if (target.nodeRef?.refType === "objective") {
    const currentId = studyState.studyPlan?.currentObjective?.id;
    const knownObjectiveIds = new Set([
      ...(studyState.studyPlan?.completedObjectives.map((item) => item.id) ?? []),
      ...(studyState.studyPlan?.upcomingObjectives.map((item) => item.id) ?? []),
      ...(currentId ? [currentId] : []),
    ]);
    if (!knownObjectiveIds.has(target.nodeRef.refId)) {
      return {
        target: fallback,
        fallbackReason: "That reading target is no longer available.",
      };
    }
  }

  return { target, fallbackReason: null };
}

export async function buildNotebookWorkspaceBootstrap(
  ctx: AppContext,
  owned: OwnedNotebookContext,
  userId: string,
  search: Record<string, string | string[] | undefined>,
): Promise<NotebookWorkspaceBootstrap> {
  const { notebook, contentNotebookId } = owned;
  const studyState = await loadNotebookStudyState(ctx.db, notebook.id, userId, {
    contentNotebookId,
  });

  const sourceRows = await ctx.db.db
    .select({
      status: sources.status,
      metadataJson: sources.metadataJson,
    })
    .from(sources)
    .where(eq(sources.notebookId, contentNotebookId));

  const studySummary = buildStudySummary(studyState);
  const allowedSurfaces = deriveAllowedSurfaces(studyState);
  const requested = parseDashboardActionTargetFromSearch(search);
  const { target, fallbackReason } = normalizeActionTarget(
    requested,
    studyState,
    allowedSurfaces,
  );

  return notebookWorkspaceBootstrapSchema.parse({
    version: 1,
    notebook: {
      id: notebook.id,
      title: notebook.title,
      description: notebook.description ?? null,
      workspaceType: notebook.workspaceType,
      templateId: notebook.studyTemplateId ?? null,
    },
    sourceSummary: summarizeSources(sourceRows),
    studySummary,
    allowedSurfaces,
    initialActionTarget: target,
    ...(fallbackReason ? { fallbackReason } : {}),
  });
}
