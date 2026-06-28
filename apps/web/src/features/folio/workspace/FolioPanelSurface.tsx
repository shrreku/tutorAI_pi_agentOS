import FullPanelViewer from "../../../FullPanelViewer.js";
import type { GraphCanvasNode } from "@studyagent/schemas";
import { getLearnerNodeTitle } from "../../../whiteboard-utils.js";
import { useWorkspaceShell } from "../../../workspace-shell-context.js";

export function FolioPanelSurface({
  notebookId,
  node,
  onOpenEvidence,
}: {
  notebookId: string;
  node: GraphCanvasNode;
  onOpenEvidence: (nodeId: string, title: string, nodeType: string) => void;
}) {
  const { setDraftTutorPrompt } = useWorkspaceShell();

  return (
    <div className="folio-reference-panel folio-panel-surface h-full min-h-0 overflow-hidden">
      <FullPanelViewer
        notebookId={notebookId}
        node={node}
        onClose={() => undefined}
        onShowProvenance={(selected) =>
          onOpenEvidence(selected.id, getLearnerNodeTitle(selected), selected.nodeType)
        }
        onDraftTutorPrompt={(prompt) => {
          setDraftTutorPrompt(prompt);
        }}
        onLaunchTutor={(selected) => {
          setDraftTutorPrompt(`Help me with ${getLearnerNodeTitle(selected)}.`);
        }}
      />
    </div>
  );
}
