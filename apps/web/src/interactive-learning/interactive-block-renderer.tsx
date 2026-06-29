import React from "react";
import type { ReferenceSurface } from "@studyagent/schemas";
import { useWorkspaceShell } from "../workspace-shell-context.js";
import { McpAppBridge } from "./mcp-app-bridge.js";
import type { InteractiveLearningBlock } from "./mcp-app-types.js";

export type InteractiveBlockRendererProps = {
  notebookId: string;
  surface: ReferenceSurface;
  block: InteractiveLearningBlock;
  sessionId?: string;
  turnId?: string;
  runId?: string;
  devMode?: boolean;
  onLaunchTutor?: () => void;
  onActionComplete?: (actionName: string) => void;
};

function NativeInteractiveFallback({
  block,
  onLaunchTutor,
}: {
  block: InteractiveLearningBlock;
  onLaunchTutor?: () => void;
}) {
  const summary =
    block.fallbackSummary ??
    (typeof block.content === "string"
      ? block.content
      : "This interactive block is shown in simplified mode.");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 12,
          background: "#fff",
          color: "#374151",
          lineHeight: 1.5,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: "#64748b",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          {block.kind.replace(/_/g, " ")}
        </div>
        <div>{summary}</div>
      </div>
      {onLaunchTutor && (
        <button
          type="button"
          onClick={onLaunchTutor}
          style={{
            alignSelf: "flex-start",
            padding: "6px 10px",
            border: "1px solid #2563eb",
            background: "#eff6ff",
            color: "#1d4ed8",
            borderRadius: 6,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Ask tutor for help
        </button>
      )}
    </div>
  );
}

export const InteractiveBlockRenderer: React.FC<InteractiveBlockRendererProps> = ({
  notebookId,
  surface,
  block,
  sessionId,
  turnId,
  runId,
  devMode = false,
  onLaunchTutor,
  onActionComplete,
}) => {
  const [useNativeFallback, setUseNativeFallback] = React.useState(
    block.rendererPreference === "native",
  );

  if (useNativeFallback) {
    return (
      <NativeInteractiveFallback block={block} {...(onLaunchTutor ? { onLaunchTutor } : {})} />
    );
  }

  return (
    <McpInteractiveBlockRenderer
      notebookId={notebookId}
      surface={surface}
      block={block}
      {...(sessionId ? { sessionId } : {})}
      {...(turnId ? { turnId } : {})}
      {...(runId ? { runId } : {})}
      devMode={devMode}
      onFallback={() => setUseNativeFallback(true)}
      {...(onActionComplete ? { onActionComplete } : {})}
    />
  );
};

const McpInteractiveBlockRenderer: React.FC<
  Omit<InteractiveBlockRendererProps, "onLaunchTutor"> & { onFallback: () => void }
> = ({
  notebookId,
  surface,
  block,
  sessionId,
  turnId,
  runId,
  devMode = false,
  onFallback,
  onActionComplete,
}) => {
  const { launchInteractiveSurface } = useWorkspaceShell();

  return (
    <McpAppBridge
      notebookId={notebookId}
      surfaceId={surface.id}
      nodeRef={surface.nodeRef}
      block={block}
      {...(sessionId ? { sessionId } : {})}
      {...(turnId ? { turnId } : {})}
      {...(runId ? { runId } : {})}
      devMode={devMode}
      onFallback={onFallback}
      onNavigate={(nodeId) =>
        launchInteractiveSurface({ nodeId, blockKind: block.kind, blockId: block.id })
      }
      {...(onActionComplete ? { onActionDispatched: onActionComplete } : {})}
    />
  );
};
