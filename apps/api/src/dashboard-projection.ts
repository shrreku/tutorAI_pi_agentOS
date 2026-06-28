import { and, desc, eq, inArray, lte } from "drizzle-orm";
import {
  artifacts,
  concepts,
  curriculumModules,
  learningState,
  notebooks,
  sources,
  tutorSessions,
  users,
  type DbClient,
} from "@studyagent/db";
import type {
  DashboardActionTarget,
  DashboardDuePracticeItem,
  DashboardDuePracticeSection,
  DashboardNotebookReadiness,
  DashboardNotebookSummary,
  DashboardRecentActivity,
  DashboardRecommendation,
  DashboardRecommendationsSection,
  DashboardResumeAction,
  LearnerDashboardSummary,
} from "@studyagent/schemas";
import {
  buildNotebookWorkspaceHref,
  learnerDashboardSummarySchema,
  resolveSourceReadiness,
} from "@studyagent/schemas";
import { resolveIngestionStatus } from "./hosted-beta/ingestion-status.js";
import { getContentNotebookId } from "./hosted-beta/notebook-context.js";
import { loadNotebookStudyState, type NotebookStudyState } from "./study-state.js";
import type { AppContext } from "./context.js";

type SourceReadinessCounts = {
  total: number;
  ready: number;
  processing: number;
  failed: number;
};

function formatRelativeActivityLabel(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function computeProgressPercent(
  studyState: NotebookStudyState,
  moduleCounts: { total: number; completed: number },
): number {
  const { coverage } = studyState;
  if (coverage.total > 0) {
    return Math.round((coverage.mastered / coverage.total) * 100);
  }
  if (moduleCounts.total > 0) {
    return Math.round((moduleCounts.completed / moduleCounts.total) * 100);
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

function buildModulesLabel(moduleCounts: { total: number; completed: number }): string {
  if (moduleCounts.total === 0) return "No modules yet";
  return `${moduleCounts.completed} of ${moduleCounts.total} module${moduleCounts.total === 1 ? "" : "s"} mastered`;
}

function deriveNotebookReadiness(
  sourceCounts: SourceReadinessCounts,
  studyState: NotebookStudyState,
): DashboardNotebookReadiness {
  if (sourceCounts.total === 0) return "empty";
  if (sourceCounts.processing > 0) return "processing";
  if (sourceCounts.failed > 0 && sourceCounts.ready === 0) return "partial";
  if (!studyState.curriculum) return "not_ready";
  if (sourceCounts.failed > 0) return "partial";
  return "ready";
}

function buildResumeAction(
  notebookId: string,
  studyState: NotebookStudyState,
): DashboardResumeAction {
  const tutor = studyState.tutorSession;
  const sessionId = tutor?.active?.id ?? tutor?.last?.id;
  let target: DashboardActionTarget;
  let label: string;

  if (tutor?.canContinue && tutor.active) {
    target = {
      surface: "tutor",
      intent: "resume",
      sessionId: tutor.active.id,
    };
    label = "Resume tutor session";
  } else if (tutor?.suggestedAction === "review_completed" && tutor.last) {
    target = {
      surface: "tutor",
      intent: "review",
      sessionId: tutor.last.id,
    };
    label = "Review last session";
  } else if (studyState.studyPlan?.currentObjective) {
    target = {
      surface: "reading",
      intent: "continue",
      nodeRef: {
        refType: "objective",
        refId: studyState.studyPlan.currentObjective.id,
        title: studyState.studyPlan.currentObjective.title,
      },
    };
    label = "Continue reading";
  } else if (studyState.curriculum) {
    target = {
      surface: "study_map",
      intent: "continue",
    };
    label = "Open study map";
  } else if (tutor?.suggestedAction === "upload_sources") {
    target = {
      surface: "tutor",
      intent: "continue",
    };
    label = "Add sources to begin";
  } else {
    target = {
      surface: "tutor",
      intent: "continue",
      ...(sessionId ? { sessionId } : {}),
    };
    label = "Open workspace";
  }

  return {
    label,
    href: buildNotebookWorkspaceHref(notebookId, target),
    target,
  };
}

async function loadSourceReadinessCounts(
  dbClient: DbClient,
  contentNotebookId: string,
): Promise<SourceReadinessCounts> {
  const rows = await dbClient.db
    .select({
      status: sources.status,
      metadataJson: sources.metadataJson,
    })
    .from(sources)
    .where(eq(sources.notebookId, contentNotebookId));

  const counts: SourceReadinessCounts = { total: rows.length, ready: 0, processing: 0, failed: 0 };
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
      counts.ready += 1;
    } else if (ingestion.failed) {
      counts.failed += 1;
    } else if (ingestion.processing || ingestion.queued) {
      counts.processing += 1;
    } else {
      counts.processing += 1;
    }
  }
  return counts;
}

async function loadModuleCounts(
  dbClient: DbClient,
  contentNotebookId: string,
  curriculumId: string | null | undefined,
): Promise<{ total: number; completed: number }> {
  if (!curriculumId) return { total: 0, completed: 0 };
  const rows = await dbClient.db
    .select({
      status: curriculumModules.status,
    })
    .from(curriculumModules)
    .where(
      and(
        eq(curriculumModules.notebookId, contentNotebookId),
        eq(curriculumModules.curriculumId, curriculumId),
      ),
    );
  const completed = rows.filter(
    (row) => row.status === "completed" || row.status === "mastered",
  ).length;
  return { total: rows.length, completed };
}

async function buildNotebookSummary(
  ctx: AppContext,
  userId: string,
  notebook: typeof notebooks.$inferSelect,
  now: Date,
): Promise<DashboardNotebookSummary> {
  const contentNotebookId = getContentNotebookId(notebook.id, notebook.settingsJson);
  const studyState = await loadNotebookStudyState(ctx.db, notebook.id, userId, {
    contentNotebookId,
  });
  const sourceCounts = await loadSourceReadinessCounts(ctx.db, contentNotebookId);
  const moduleCounts = await loadModuleCounts(
    ctx.db,
    contentNotebookId,
    studyState.curriculum?.id,
  );
  const progressPercent = computeProgressPercent(studyState, moduleCounts);
  const lastActivityAt = notebook.updatedAt ?? notebook.createdAt;

  return {
    id: notebook.id,
    title: notebook.title,
    description: notebook.description ?? null,
    progressPercent,
    modulesLabel: buildModulesLabel(moduleCounts),
    lastActivityLabel: formatRelativeActivityLabel(lastActivityAt, now),
    readiness: deriveNotebookReadiness(sourceCounts, studyState),
    resumeAction: buildResumeAction(notebook.id, studyState),
  };
}

async function loadRecentActivity(
  ctx: AppContext,
  userId: string,
  notebookRows: Array<typeof notebooks.$inferSelect>,
  now: Date,
): Promise<DashboardRecentActivity[]> {
  if (notebookRows.length === 0) return [];

  const notebookById = new Map(notebookRows.map((row) => [row.id, row]));
  const notebookIds = notebookRows.map((row) => row.id);
  const entries: DashboardRecentActivity[] = [];

  for (const notebook of notebookRows) {
    entries.push({
      id: `activity_nb_${notebook.id}`,
      notebookId: notebook.id,
      notebookTitle: notebook.title,
      title: "Workspace updated",
      detail: notebook.description ?? null,
      occurredAt: (notebook.updatedAt ?? notebook.createdAt).toISOString(),
      actionTarget: {
        surface: "study_map",
        intent: "continue",
      },
    });
  }

  const sessionRows = await ctx.db.db
    .select({
      id: tutorSessions.id,
      notebookId: tutorSessions.notebookId,
      mode: tutorSessions.mode,
      status: tutorSessions.status,
      startedAt: tutorSessions.startedAt,
      endedAt: tutorSessions.endedAt,
    })
    .from(tutorSessions)
    .where(and(eq(tutorSessions.userId, userId), inArray(tutorSessions.notebookId, notebookIds)))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(20);

  for (const session of sessionRows) {
    const notebook = notebookById.get(session.notebookId);
    if (!notebook) continue;
    const occurredAt = (session.endedAt ?? session.startedAt).toISOString();
    const isActive = session.status === "active" || session.status === "paused";
    entries.push({
      id: `activity_session_${session.id}`,
      notebookId: session.notebookId,
      notebookTitle: notebook.title,
      title: isActive ? "Tutor session in progress" : "Tutor session",
      detail: `${session.mode.replace(/_/g, " ")} · ${formatRelativeActivityLabel(
        session.endedAt ?? session.startedAt,
        now,
      )}`,
      occurredAt,
      actionTarget: {
        surface: "tutor",
        intent: isActive ? "resume" : "review",
        sessionId: session.id,
      },
    });
  }

  const artifactRows = await ctx.db.db
    .select({
      id: artifacts.id,
      notebookId: artifacts.notebookId,
      title: artifacts.title,
      artifactType: artifacts.artifactType,
      updatedAt: artifacts.updatedAt,
    })
    .from(artifacts)
    .where(and(inArray(artifacts.notebookId, notebookIds)))
    .orderBy(desc(artifacts.updatedAt))
    .limit(15);

  for (const artifact of artifactRows) {
    if (["teaching_arc", "study_plan", "session_plan", "session_digest"].includes(artifact.artifactType)) {
      continue;
    }
    const notebook = notebookById.get(artifact.notebookId);
    if (!notebook) continue;
    entries.push({
      id: `activity_artifact_${artifact.id}`,
      notebookId: artifact.notebookId,
      notebookTitle: notebook.title,
      title: artifact.title,
      detail: artifact.artifactType.replace(/_/g, " "),
      occurredAt: artifact.updatedAt.toISOString(),
      actionTarget: {
        surface: artifact.artifactType.includes("quiz") ? "practice" : "reading",
        intent: "review",
        artifactId: artifact.id,
        nodeRef: {
          refType: "artifact",
          refId: artifact.id,
          title: artifact.title,
        },
      },
    });
  }

  return entries
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 20);
}

const PRACTICE_ARTIFACT_TYPES = new Set([
  "quiz",
  "flashcard_deck",
  "flashcards",
  "worked_example",
  "practice_set",
]);

function estimatePracticeMinutes(artifactType: string): number {
  if (artifactType.includes("flashcard")) return 5;
  if (artifactType.includes("quiz")) return 10;
  return 8;
}

async function loadDuePracticeItems(
  ctx: AppContext,
  userId: string,
  notebookRows: Array<typeof notebooks.$inferSelect>,
  now: Date,
): Promise<DashboardDuePracticeSection> {
  if (notebookRows.length === 0) {
    return { status: "empty" };
  }

  const notebookById = new Map(notebookRows.map((row) => [row.id, row]));
  const notebookIds = notebookRows.map((row) => row.id);
  const items: DashboardDuePracticeItem[] = [];

  const dueLearningRows = await ctx.db.db
    .select({
      id: learningState.id,
      notebookId: learningState.notebookId,
      conceptId: learningState.conceptId,
      nextReviewAt: learningState.nextReviewAt,
      conceptName: concepts.canonicalName,
    })
    .from(learningState)
    .innerJoin(concepts, eq(learningState.conceptId, concepts.id))
    .where(
      and(
        eq(learningState.userId, userId),
        inArray(learningState.notebookId, notebookIds),
        lte(learningState.nextReviewAt, now),
      ),
    )
    .orderBy(learningState.nextReviewAt)
    .limit(12);

  for (const row of dueLearningRows) {
    const notebook = notebookById.get(row.notebookId);
    if (!notebook) continue;
    const overdue = row.nextReviewAt != null && row.nextReviewAt.getTime() < now.getTime() - 86_400_000;
    items.push({
      id: `due_ls_${row.id}`,
      notebookId: row.notebookId,
      notebookTitle: notebook.title,
      label: `Review ${row.conceptName}`,
      detail: "Spaced review due",
      minutesEstimate: 5,
      status: overdue ? "overdue" : "ready",
      actionTarget: {
        surface: "practice",
        intent: "practice",
        nodeRef: {
          refType: "concept",
          refId: row.conceptId,
          title: row.conceptName,
        },
      },
    });
  }

  const artifactRows = await ctx.db.db
    .select({
      id: artifacts.id,
      notebookId: artifacts.notebookId,
      title: artifacts.title,
      artifactType: artifacts.artifactType,
      updatedAt: artifacts.updatedAt,
    })
    .from(artifacts)
    .where(and(inArray(artifacts.notebookId, notebookIds), eq(artifacts.status, "ready")))
    .orderBy(desc(artifacts.updatedAt))
    .limit(20);

  for (const artifact of artifactRows) {
    if (!PRACTICE_ARTIFACT_TYPES.has(artifact.artifactType)) continue;
    if (items.some((item) => item.actionTarget.artifactId === artifact.id)) continue;
    const notebook = notebookById.get(artifact.notebookId);
    if (!notebook) continue;
    items.push({
      id: `due_art_${artifact.id}`,
      notebookId: artifact.notebookId,
      notebookTitle: notebook.title,
      label: artifact.title,
      detail: artifact.artifactType.replace(/_/g, " "),
      minutesEstimate: estimatePracticeMinutes(artifact.artifactType),
      status: "suggested",
      actionTarget: {
        surface: "practice",
        intent: "practice",
        artifactId: artifact.id,
        nodeRef: {
          refType: "artifact",
          refId: artifact.id,
          title: artifact.title,
        },
      },
    });
  }

  if (items.length === 0) {
    return { status: "empty" };
  }

  return {
    status: "ready",
    items: items.slice(0, 8),
  };
}

async function loadRecommendations(
  ctx: AppContext,
  userId: string,
  notebookRows: Array<typeof notebooks.$inferSelect>,
): Promise<DashboardRecommendationsSection> {
  if (notebookRows.length === 0) {
    return { status: "empty" };
  }

  const recommendations: DashboardRecommendation[] = [];

  for (const notebook of notebookRows) {
    const contentNotebookId = getContentNotebookId(notebook.id, notebook.settingsJson);
    const studyState = await loadNotebookStudyState(ctx.db, notebook.id, userId, {
      contentNotebookId,
    });

    if (studyState.studyPlan?.currentObjective) {
      const objective = studyState.studyPlan.currentObjective;
      recommendations.push({
        id: `rec_obj_${notebook.id}_${objective.id}`,
        notebookId: notebook.id,
        notebookTitle: notebook.title,
        label: `Continue ${objective.title}`,
        reason: "Pick up your current objective",
        status: "active",
        minutesEstimate: 15,
        actionTarget: {
          surface: "reading",
          intent: "continue",
          nodeRef: {
            refType: "objective",
            refId: objective.id,
            title: objective.title,
          },
        },
      });
    }

    for (const weak of studyState.studyPlan?.weakConcepts.slice(0, 2) ?? []) {
      recommendations.push({
        id: `rec_weak_${notebook.id}_${weak.id}`,
        notebookId: notebook.id,
        notebookTitle: notebook.title,
        label: `Strengthen ${weak.name}`,
        reason: "This concept needs more practice",
        status: "suggested",
        minutesEstimate: 10,
        actionTarget: {
          surface: "practice",
          intent: "practice",
          nodeRef: {
            refType: "concept",
            refId: weak.id,
            title: weak.name,
          },
        },
      });
    }

    if (studyState.tutorSession?.canContinue && studyState.tutorSession.active) {
      recommendations.push({
        id: `rec_tutor_${notebook.id}_${studyState.tutorSession.active.id}`,
        notebookId: notebook.id,
        notebookTitle: notebook.title,
        label: "Resume tutor session",
        reason: "Your last session can continue",
        status: "active",
        minutesEstimate: 12,
        actionTarget: {
          surface: "tutor",
          intent: "resume",
          sessionId: studyState.tutorSession.active.id,
        },
      });
    } else if (studyState.curriculum) {
      recommendations.push({
        id: `rec_map_${notebook.id}`,
        notebookId: notebook.id,
        notebookTitle: notebook.title,
        label: `Open ${studyState.curriculum.title}`,
        reason: "Review progress on your study map",
        status: "suggested",
        minutesEstimate: 8,
        actionTarget: {
          surface: "study_map",
          intent: "continue",
        },
      });
    }
  }

  if (recommendations.length === 0) {
    return { status: "empty" };
  }

  const seen = new Set<string>();
  const deduped = recommendations.filter((item) => {
    const key = JSON.stringify(item.actionTarget);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    status: "ready",
    items: deduped.slice(0, 6),
    enrichmentStatus: "none",
  };
}

export async function buildLearnerDashboardSummary(
  ctx: AppContext,
  userId: string,
): Promise<LearnerDashboardSummary> {
  const now = new Date();
  const [user] = await ctx.db.db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const notebookRows = await ctx.db.db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.ownerId, userId)))
    .orderBy(desc(notebooks.updatedAt));

  const ownedNotebooks = notebookRows.filter((row) => !row.disabledAt);
  const summaries = await Promise.all(
    ownedNotebooks.map((notebook) => buildNotebookSummary(ctx, userId, notebook, now)),
  );
  const recentActivity = await loadRecentActivity(ctx, userId, ownedNotebooks, now);
  const duePractice = await loadDuePracticeItems(ctx, userId, ownedNotebooks, now);
  const recommendations = await loadRecommendations(ctx, userId, ownedNotebooks);

  return learnerDashboardSummarySchema.parse({
    version: 1,
    header: {
      displayName: user?.displayName ?? null,
      generatedAt: now.toISOString(),
    },
    notebooks: summaries,
    recentActivity,
    studyTime: { status: "unavailable" },
    duePractice,
    recommendations,
  });
}
