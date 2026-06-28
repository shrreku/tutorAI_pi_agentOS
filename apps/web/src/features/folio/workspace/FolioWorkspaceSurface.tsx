import type { DashboardSurface, GraphCanvasNode } from "@studyagent/schemas";
import { FolioEmptyState } from "../primitives.js";
import { FolioPanelSurface } from "./FolioPanelSurface.js";
import { FolioStudyMap } from "./FolioStudyMap.js";

export function FolioWorkspaceSurface({
  notebookId,
  surface,
  selectedNodeId,
  selectedNode,
  graphRefreshToken,
  onSelectNode,
  onOpenEvidence,
}: {
  notebookId: string;
  surface: DashboardSurface;
  selectedNodeId: string | null;
  selectedNode: GraphCanvasNode | null;
  graphRefreshToken: number;
  onSelectNode: (nodeId: string | null, node?: GraphCanvasNode) => void;
  onOpenEvidence: (nodeId: string, title: string, nodeType: string) => void;
}) {
  if (surface === "study_map") {
    return (
      <FolioStudyMap
        notebookId={notebookId}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
        onOpenEvidence={onOpenEvidence}
        graphRefreshToken={graphRefreshToken}
      />
    );
  }

  const needsNode =
    surface === "reading" ||
    surface === "practice" ||
    surface === "interactive" ||
    surface === "app";

  if (needsNode && !selectedNode) {
    return (
      <FolioEmptyState
        title={
          surface === "reading"
            ? "Choose a reading target"
            : `Choose a ${surface.replace(/_/g, " ")} target`
        }
        description="Select a node on the study map to open its reference surface, practice item, or interactive block."
      />
    );
  }

  if (needsNode && selectedNode) {
    return (
      <FolioPanelSurface
        notebookId={notebookId}
        node={selectedNode}
        onOpenEvidence={onOpenEvidence}
      />
    );
  }

  return (
    <FolioStudyMap
      notebookId={notebookId}
      selectedNodeId={selectedNodeId}
      onSelectNode={onSelectNode}
      onOpenEvidence={onOpenEvidence}
      graphRefreshToken={graphRefreshToken}
    />
  );
}
