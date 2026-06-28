import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import {
  parseDashboardActionTargetFromSearch,
  serializeDashboardActionTargetToSearch,
  type DashboardActionTarget,
} from "@studyagent/schemas";
import type { WorkspaceSearch } from "../../../app/workspace-search.js";

const notebookRoute = getRouteApi("/notebooks/$notebookId");

export function useWorkspaceSearch(notebookId: string) {
  const search = notebookRoute.useSearch();
  const navigate = useNavigate();

  const actionTarget = useMemo(
    () => parseDashboardActionTargetFromSearch(search),
    [search],
  );

  const replaceActionTarget = useCallback(
    (target: DashboardActionTarget) => {
      const params = serializeDashboardActionTargetToSearch(target);
      void navigate({
        to: "/notebooks/$notebookId",
        params: { notebookId },
        search: Object.fromEntries(params.entries()),
      });
    },
    [navigate, notebookId],
  );

  return { actionTarget, replaceActionTarget, search };
}

export type { WorkspaceSearch };
