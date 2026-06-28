import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceBootstrapQueryOptions } from "@studyagent/api-client";
import type { DashboardSurface, GraphCanvasNode } from "@studyagent/schemas";
import { nodeRefSchema } from "@studyagent/schemas";
import { getLearnerNodeTitle } from "../../../whiteboard-utils.js";
import { mapGraphNodeToNodeRef } from "../../../whiteboard-node-ref.js";
import { NotebookWorkspaceSyncBridge } from "../../../notebook-workspace-sync-bridge.js";
import { WorkspaceShellProvider } from "../../../workspace-shell-context.js";
import { apiClient } from "../lib/api-client.js";
import { useWorkspaceSearch } from "../lib/use-workspace-search.js";
import { FolioTutorPanel } from "../tutor/FolioTutorPanel.js";
import { FolioEvidenceDrawer } from "./FolioEvidenceDrawer.js";
import { FolioSplitPane } from "./FolioSplitPane.js";
import { FolioWorkspaceHeader } from "./FolioWorkspaceHeader.js";
import { FolioWorkspaceSurface } from "./FolioWorkspaceSurface.js";
import { FolioErrorNotice, FolioSkeleton } from "../primitives.js";
import { FolioSourcePanel } from "./FolioSourcePanel.js";
import { surfaceAfterNodeSelect, workspacePaneSurface } from "./workspace-pane-surface.js";

export function FolioNotebookWorkspacePage({
  notebookId,
  navigate,
}: {
  notebookId: string;
  navigate: (path: string) => void;
}) {
  const queryClient = useQueryClient();
  const { actionTarget, replaceActionTarget, search } = useWorkspaceSearch(notebookId);

  const bootstrapQuery = useQuery({
    ...workspaceBootstrapQueryOptions(apiClient.request, notebookId, search),
    enabled: Boolean(notebookId),
  });

  const bootstrap = bootstrapQuery.data;
  const activeSurface: DashboardSurface =
    actionTarget?.surface ?? bootstrap?.initialActionTarget.surface ?? "study_map";

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphCanvasNode | null>(null);
  const [graphRefreshToken, setGraphRefreshToken] = useState(0);
  const [evidenceTarget, setEvidenceTarget] = useState<{
    nodeId: string;
    title: string;
    nodeType: string;
  } | null>(null);

  const [selectedNodeRefs, setSelectedNodeRefs] = useState<Array<{ refType: string; refId: string }>>(
    [],
  );

  const contextNodeRefs = useMemo(() => {
    if (actionTarget?.nodeRef) {
      return [{ refType: actionTarget.nodeRef.refType, refId: actionTarget.nodeRef.refId }];
    }
    if (selectedNode) {
      return [mapGraphNodeToNodeRef(selectedNode)];
    }
    return selectedNodeRefs;
  }, [actionTarget, selectedNode, selectedNodeRefs]);

  const handleGraphProjectionUpdated = useCallback(() => {
    setGraphRefreshToken((token) => token + 1);
  }, []);

  const onSurfaceChange = useCallback(
    (surface: DashboardSurface) => {
      const nextTarget = {
        surface,
        intent: actionTarget?.intent ?? bootstrap?.initialActionTarget.intent ?? ("continue" as const),
        ...(actionTarget?.nodeRef ? { nodeRef: actionTarget.nodeRef } : {}),
        ...(actionTarget?.artifactId ? { artifactId: actionTarget.artifactId } : {}),
        ...(actionTarget?.sessionId ? { sessionId: actionTarget.sessionId } : {}),
      };
      replaceActionTarget(nextTarget);
    },
    [actionTarget, bootstrap, replaceActionTarget],
  );

  const onSelectNode = useCallback(
    (nodeId: string | null, node?: GraphCanvasNode) => {
      setSelectedNodeId(nodeId);
      setSelectedNode(node ?? null);
      if (!nodeId || !node) return;
      const mappedRef = mapGraphNodeToNodeRef(node);
      const nodeRef = nodeRefSchema.safeParse({
        refType: mappedRef.refType,
        refId: mappedRef.refId,
        title: getLearnerNodeTitle(node),
      }).data;
      if (!nodeRef) return;
      setSelectedNodeRefs([mappedRef]);
      replaceActionTarget({
        surface: surfaceAfterNodeSelect(activeSurface),
        intent: actionTarget?.intent ?? "continue",
        nodeRef,
      });
    },
    [activeSurface, actionTarget, replaceActionTarget],
  );

  const onOpenEvidence = useCallback(
    (nodeId: string, title: string, nodeType: string) => {
      setEvidenceTarget({ nodeId, title, nodeType });
    },
    [],
  );

  if (bootstrapQuery.isLoading) {
    return (
      <div className="folio-workspace-root" data-theme="folio">
        <FolioSkeleton className="m-4 h-12 w-64" />
        <FolioSkeleton className="m-4 h-[70vh] w-[calc(100%-2rem)]" />
      </div>
    );
  }

  if (bootstrapQuery.isError || !bootstrap) {
    return (
      <div className="folio-workspace-root p-6" data-theme="folio">
        <FolioErrorNotice
          title="Workspace unavailable"
          message={
            bootstrapQuery.error instanceof Error
              ? bootstrapQuery.error.message
              : "We could not open this notebook."
          }
          onRetry={() => void bootstrapQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <WorkspaceShellProvider
      notebookId={notebookId}
      selectedNodeRefs={contextNodeRefs}
      onSelectedNodeRefsChange={setSelectedNodeRefs}
    >
      <div className="folio-workspace-root" data-theme="folio">
        <NotebookWorkspaceSyncBridge
          notebookId={notebookId}
          queryClient={queryClient}
          onGraphProjectionUpdated={handleGraphProjectionUpdated}
        />
        <FolioSourcePanel
          notebookId={notebookId}
          onGraphProjectionUpdated={handleGraphProjectionUpdated}
        />
        <FolioWorkspaceHeader
          bootstrap={bootstrap}
          activeSurface={activeSurface}
          onSurfaceChange={onSurfaceChange}
          onBack={() => navigate("/app")}
          selectedNodeId={selectedNodeId}
          selectedNode={selectedNode}
          onOpenEvidence={onOpenEvidence}
        />
        <FolioSplitPane
          storageKey={`folio.split.${notebookId}`}
          left={
            <FolioTutorPanel
              notebookId={notebookId}
              selectedNodeRefs={contextNodeRefs}
              sessionId={
                actionTarget?.sessionId ??
                bootstrap.initialActionTarget.sessionId ??
                bootstrap.studySummary.activeSessionId
              }
            />
          }
          right={
            <FolioWorkspaceSurface
              notebookId={notebookId}
              surface={workspacePaneSurface(activeSurface)}
              selectedNodeId={selectedNodeId}
              selectedNode={selectedNode}
              graphRefreshToken={graphRefreshToken}
              onSelectNode={onSelectNode}
              onOpenEvidence={onOpenEvidence}
            />
          }
        />
        <FolioEvidenceDrawer
          open={Boolean(evidenceTarget)}
          notebookId={notebookId}
          nodeId={evidenceTarget?.nodeId ?? null}
          nodeTitle={evidenceTarget?.title ?? null}
          nodeType={evidenceTarget?.nodeType ?? null}
          onClose={() => setEvidenceTarget(null)}
        />
      </div>
    </WorkspaceShellProvider>
  );
}
