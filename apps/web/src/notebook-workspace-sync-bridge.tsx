import type { QueryClient } from "@tanstack/react-query";
import { useNotebookWorkspaceSync } from "./notebook-workspace-sync.js";
import { useWorkspaceShell } from "./workspace-shell-context.js";

export function NotebookWorkspaceSyncBridge(input: {
  notebookId: string;
  queryClient: QueryClient;
  onGraphProjectionUpdated: () => void;
}): null {
  const { launchInteractiveSurface } = useWorkspaceShell();

  useNotebookWorkspaceSync({
    notebookId: input.notebookId,
    queryClient: input.queryClient,
    onGraphProjectionUpdated: input.onGraphProjectionUpdated,
    onInteractiveSurfaceLaunch: launchInteractiveSurface,
  });

  return null;
}
