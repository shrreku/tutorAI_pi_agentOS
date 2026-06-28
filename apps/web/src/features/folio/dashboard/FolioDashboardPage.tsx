import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dashboardSummaryQueryOptions } from "@studyagent/api-client";
import {
  buildNotebookWorkspaceHref,
  type DashboardActionTarget,
  type DashboardNotebookSummary,
} from "@studyagent/schemas";
import { useSession } from "../../../routing/RouteGuards.js";
import { apiClient } from "../lib/api-client.js";
import {
  Badge,
  Button,
  Eyebrow,
  FolioEmptyState,
  FolioErrorNotice,
  FolioSkeleton,
  Meter,
} from "../primitives.js";
import { NotebookShelf } from "./NotebookShelf.js";
import { DuePracticePanel, RecommendationsPanel } from "./DashboardSidePanels.js";
import { StudyTimePanel } from "./StudyTimePanel.js";

function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function FolioDashboardPage({ navigate }: { navigate: (path: string) => void }) {
  const { session } = useSession();
  const dashboardQuery = useQuery(dashboardSummaryQueryOptions(apiClient.request));

  const firstName = useMemo(() => {
    const displayName = session?.user?.displayName ?? dashboardQuery.data?.header.displayName;
    if (!displayName) return "Reader";
    return displayName.split(" ")[0] ?? displayName;
  }, [session, dashboardQuery.data]);

  const openNotebook = (notebook: DashboardNotebookSummary, action: "primary" | "secondary") => {
    const target =
      action === "primary"
        ? notebook.resumeAction.target
        : { surface: "study_map" as const, intent: "continue" as const };
    navigate(buildNotebookWorkspaceHref(notebook.id, target));
  };

  const openActivity = (notebookId: string, target: DashboardActionTarget) => {
    navigate(buildNotebookWorkspaceHref(notebookId, target));
  };

  if (dashboardQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
        <FolioSkeleton className="h-10 w-64" />
        <FolioSkeleton className="mt-6 h-48 w-full" />
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
        <FolioErrorNotice
          title="Dashboard unavailable"
          message={
            dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : "We could not load your study journal."
          }
          onRetry={() => void dashboardQuery.refetch()}
        />
      </div>
    );
  }

  const summary = dashboardQuery.data;
  if (!summary) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-10">
      <div className="border-b-2 border-foreground/80 pb-5">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>The Study Journal</span>
          <span>
            {new Date(summary.header.generatedAt).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
        <h1 className="mt-3 font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.02em]">
          Welcome back, {firstName}.
        </h1>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-8">
          {summary.notebooks.length > 0 ? (
            <NotebookShelf notebooks={summary.notebooks} onOpenNotebook={openNotebook} />
          ) : (
            <FolioEmptyState
              title="No notebooks yet"
              description="Create a workspace from a published study template to begin your journal."
              action={
                <Button variant="accent" onClick={() => navigate("/app/workspaces/new")}>
                  Create workspace
                </Button>
              }
            />
          )}

          <div>
            <Eyebrow>Recent activity</Eyebrow>
            {summary.recentActivity.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Activity from tutor sessions and practice will appear here.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border border-y border-border">
                {summary.recentActivity.map((activity) => (
                  <li key={activity.id}>
                    <button
                      type="button"
                      className="flex w-full gap-3 py-2.5 text-left hover:bg-muted/40"
                      onClick={() => {
                        if (activity.actionTarget) {
                          openActivity(activity.notebookId, activity.actionTarget);
                        } else {
                          navigate(`/notebooks/${encodeURIComponent(activity.notebookId)}`);
                        }
                      }}
                    >
                      <span className="w-14 shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {formatActivityTime(activity.occurredAt)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[14px] leading-snug">
                          {activity.title}
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                          {activity.notebookTitle}
                          {activity.detail ? ` · ${activity.detail}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-7">
          <DuePracticePanel
            section={summary.duePractice}
            onOpenItem={(item) =>
              navigate(buildNotebookWorkspaceHref(item.notebookId, item.actionTarget))
            }
          />

          <RecommendationsPanel
            section={summary.recommendations}
            onOpenItem={(item) =>
              navigate(buildNotebookWorkspaceHref(item.notebookId, item.actionTarget))
            }
          />

          <div>
            <Eyebrow>Study activity</Eyebrow>
            <StudyTimePanel studyTime={summary.studyTime} />
          </div>

          {session?.credits ? (
            <div className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-card px-3 py-2">
              <span className="text-[12px] text-muted-foreground">Tutor credits</span>
              <div className="flex items-center gap-2">
                <Meter className="w-24" value={session.credits.percentRemaining} tone="accent" />
                <Badge tone="accent">{Math.round(session.credits.percentRemaining)}%</Badge>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
