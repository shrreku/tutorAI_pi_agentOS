import React from "react";
import type { ReferenceSurface } from "@studyagent/schemas";
import {
  MCP_APP_BRIDGE_CHANNEL,
  MCP_APP_SANDBOX_ATTR,
  bundleAssetUrl,
  resolveBundleForBlock,
  type McpAppBundleManifest,
} from "./mcp-app-registry.js";
import type {
  InteractiveLearningActionEnvelope,
  InteractiveLearningBlock,
  McpAppHostContext,
} from "./mcp-app-types.js";

export { MCP_APP_BRIDGE_CHANNEL, MCP_APP_SANDBOX_ATTR };

export type BridgeMessageDirection = "host-to-app" | "app-to-host";

export type HostToAppMessageType = "ui/initialize" | "tool-input" | "block-state" | "tool-result" | "teardown";

export type AppToHostMessageType = "ready" | "action" | "navigate" | "error";

export type BridgeMessageBase = {
  channel: typeof MCP_APP_BRIDGE_CHANNEL;
  direction: BridgeMessageDirection;
  type: string;
};

export type HostToAppMessage = BridgeMessageBase & {
  direction: "host-to-app";
  type: HostToAppMessageType;
  payload?: unknown;
};

export type AppToHostMessage = BridgeMessageBase & {
  direction: "app-to-host";
  type: AppToHostMessageType;
  actionName?: string;
  payload?: unknown;
  message?: string;
};

export type BridgeMessage = HostToAppMessage | AppToHostMessage;

export type BridgeDiagnostic = {
  at: string;
  direction: BridgeMessageDirection;
  type: string;
  detail?: string;
};

export function buildInitializeMessage(hostContext: McpAppHostContext): HostToAppMessage {
  return {
    channel: MCP_APP_BRIDGE_CHANNEL,
    direction: "host-to-app",
    type: "ui/initialize",
    payload: hostContext,
  };
}

export function buildBlockStateMessage(input: {
  block: InteractiveLearningBlock;
  canonicalState?: unknown;
}): HostToAppMessage {
  return {
    channel: MCP_APP_BRIDGE_CHANNEL,
    direction: "host-to-app",
    type: "block-state",
    payload: {
      block: input.block,
      canonicalState: input.canonicalState ?? input.block.canonicalState ?? null,
    },
  };
}

export function buildToolInputMessage(block: InteractiveLearningBlock): HostToAppMessage {
  return {
    channel: MCP_APP_BRIDGE_CHANNEL,
    direction: "host-to-app",
    type: "tool-input",
    payload: { block },
  };
}

export function buildToolResultMessage(input: {
  canonicalState: unknown;
  error?: string;
}): HostToAppMessage {
  return {
    channel: MCP_APP_BRIDGE_CHANNEL,
    direction: "host-to-app",
    type: "tool-result",
    payload: input,
  };
}

export function buildTeardownMessage(): HostToAppMessage {
  return {
    channel: MCP_APP_BRIDGE_CHANNEL,
    direction: "host-to-app",
    type: "teardown",
  };
}

export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.channel !== MCP_APP_BRIDGE_CHANNEL) return null;
  if (record.direction !== "host-to-app" && record.direction !== "app-to-host") return null;
  if (typeof record.type !== "string") return null;
  return data as BridgeMessage;
}

export function buildActionEnvelope(input: {
  notebookId: string;
  surfaceId: string;
  block: InteractiveLearningBlock;
  nodeRef: ReferenceSurface["nodeRef"];
  actionName: string;
  actionPayload: unknown;
  manifest: McpAppBundleManifest;
  sessionId?: string;
  turnId?: string;
  runId?: string;
}): InteractiveLearningActionEnvelope {
  const actionName = input.actionName;
  if (!input.manifest.supportedActions.includes(actionName)) {
    throw new Error(`Action ${input.actionName} is not supported by ${input.manifest.bundleId}.`);
  }
  if (!input.block.allowedActions.some((allowedAction) => allowedAction === actionName)) {
    throw new Error(`Action ${input.actionName} is not allowed for block ${input.block.id}.`);
  }
  return {
    notebookId: input.notebookId,
    surfaceId: input.surfaceId,
    blockId: input.block.id,
    nodeRef: input.nodeRef,
    ...(input.block.artifactRef ? { artifactId: input.block.artifactRef.refId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.turnId ? { turnId: input.turnId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    actionName: input.actionName,
    actionPayload: input.actionPayload,
    rendererKind: "mcp_app",
    rendererVersion: input.manifest.version,
    createdAt: new Date().toISOString(),
  };
}

export function interactiveLearningActionsUrl(notebookId: string): string {
  return `/api/v1/notebooks/${encodeURIComponent(notebookId)}/interactive-learning/actions`;
}

export async function dispatchInteractiveLearningAction(
  envelope: InteractiveLearningActionEnvelope,
): Promise<{ canonicalState?: unknown; block?: InteractiveLearningBlock }> {
  const response = await fetch(interactiveLearningActionsUrl(envelope.notebookId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });
  if (!response.ok) {
    throw new Error(`Interactive learning action failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    ok?: boolean;
    block?: InteractiveLearningBlock;
  };
  const result: { canonicalState?: unknown; block?: InteractiveLearningBlock } = {};
  if (payload.block) {
    result.block = payload.block;
    result.canonicalState = payload.block.canonicalState;
  }
  return result;
}

export type McpAppBridgeProps = {
  notebookId: string;
  surfaceId: string;
  nodeRef: ReferenceSurface["nodeRef"];
  block: InteractiveLearningBlock;
  hostContext?: Partial<McpAppHostContext>;
  sessionId?: string;
  turnId?: string;
  runId?: string;
  devMode?: boolean;
  onActionDispatched?: (actionName: string) => void;
  onNavigate?: (nodeId: string) => void;
  onError?: (message: string) => void;
  onStateUpdate?: (canonicalState: unknown) => void;
  onFallback?: () => void;
};

export const McpAppBridge: React.FC<McpAppBridgeProps> = ({
  notebookId,
  surfaceId,
  nodeRef,
  block,
  hostContext,
  sessionId,
  turnId,
  runId,
  devMode = false,
  onActionDispatched,
  onNavigate,
  onError,
  onStateUpdate,
  onFallback,
}) => {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [canonicalState, setCanonicalState] = React.useState<unknown>(block.canonicalState ?? null);
  const [diagnostics, setDiagnostics] = React.useState<BridgeDiagnostic[]>([]);
  const canonicalStateRef = React.useRef(canonicalState);
  const blockRef = React.useRef(block);
  const manifest = resolveBundleForBlock(block);
  const assetUrl = manifest ? bundleAssetUrl(manifest) : null;

  canonicalStateRef.current = canonicalState;
  blockRef.current = block;

  const recordDiagnostic = React.useCallback((entry: Omit<BridgeDiagnostic, "at">) => {
    setDiagnostics((current) => [
      ...current.slice(-19),
      {
        ...entry,
        at: new Date().toISOString(),
      },
    ]);
  }, []);

  const postToIframe = React.useCallback(
    (message: HostToAppMessage) => {
      const frame = iframeRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage(message, "*");
      recordDiagnostic({ direction: "host-to-app", type: message.type });
    },
    [recordDiagnostic],
  );

  const sendInitialize = React.useCallback(() => {
    const rect = iframeRef.current?.getBoundingClientRect();
    postToIframe(
      buildInitializeMessage({
        theme: hostContext?.theme ?? "light",
        width: Math.round(rect?.width ?? hostContext?.width ?? 640),
        height: Math.round(rect?.height ?? hostContext?.height ?? 420),
        devMode: devMode || Boolean(hostContext?.devMode),
      }),
    );
  }, [devMode, hostContext, postToIframe]);

  const pushBlockState = React.useCallback(() => {
    postToIframe(buildToolInputMessage(block));
    postToIframe(buildBlockStateMessage({ block, canonicalState }));
  }, [block, canonicalState, postToIframe]);

  React.useEffect(() => {
    setCanonicalState(block.canonicalState ?? null);
  }, [block.canonicalState, block.id]);

  const postToIframeRef = React.useRef(postToIframe);
  postToIframeRef.current = postToIframe;

  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = parseBridgeMessage(event.data);
      if (!message || message.direction !== "app-to-host") return;

      const diagnostic: Omit<BridgeDiagnostic, "at"> = {
        direction: "app-to-host",
        type: message.type,
      };
      const detail = message.type === "action" ? message.actionName : message.message;
      if (detail) diagnostic.detail = detail;
      recordDiagnostic(diagnostic);

      if (message.type === "ready") {
        sendInitialize();
        pushBlockState();
        return;
      }

      if (message.type === "error") {
        const errorMessage = message.message ?? "MCP app reported an error.";
        onError?.(errorMessage);
        setLoadFailed(true);
        onFallback?.();
        return;
      }

      if (message.type === "navigate") {
        const nodeId = (message.payload as { nodeId?: string } | undefined)?.nodeId;
        if (nodeId) {
          onNavigate?.(nodeId);
        }
        return;
      }

      const activeManifest = resolveBundleForBlock(blockRef.current);
      if (message.type !== "action" || !activeManifest) return;
      const actionName = message.actionName;
      if (!actionName) return;

      void (async () => {
        try {
          const envelope = buildActionEnvelope({
            notebookId,
            surfaceId,
            block: blockRef.current,
            nodeRef,
            actionName,
            actionPayload: message.payload ?? {},
            manifest: activeManifest,
            ...(sessionId ? { sessionId } : {}),
            ...(turnId ? { turnId } : {}),
            ...(runId ? { runId } : {}),
          });
          const result = await dispatchInteractiveLearningAction(envelope);
          const nextState =
            result.canonicalState ?? result.block?.canonicalState ?? canonicalStateRef.current;
          setCanonicalState(nextState);
          onStateUpdate?.(nextState);
          postToIframeRef.current(buildToolResultMessage({ canonicalState: nextState }));
          onActionDispatched?.(actionName);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Action dispatch failed.";
          onError?.(errorMessage);
          postToIframeRef.current(
            buildToolResultMessage({ canonicalState: canonicalStateRef.current, error: errorMessage }),
          );
        }
      })();
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    nodeRef,
    notebookId,
    onActionDispatched,
    onNavigate,
    onError,
    onFallback,
    onStateUpdate,
    sessionId,
    turnId,
    runId,
    postToIframe,
    pushBlockState,
    recordDiagnostic,
    sendInitialize,
    surfaceId,
  ]);

  React.useEffect(() => {
    return () => {
      postToIframeRef.current(buildTeardownMessage());
    };
  }, []);

  React.useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    pushBlockState();
  }, [block, canonicalState, pushBlockState]);

  if (!manifest || !assetUrl) {
    return (
      <div style={fallbackStyle}>
        <strong>Interactive block unavailable.</strong>
        <div>{block.fallbackSummary ?? "This learning block cannot be rendered right now."}</div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div style={fallbackStyle}>
        <strong>{block.title ?? block.kind.replace(/_/g, " ")}</strong>
        <div>{block.fallbackSummary ?? "The interactive view failed to load. You can still review the summary above."}</div>
        {devMode && diagnostics.length > 0 && (
          <pre style={diagnosticsStyle}>{JSON.stringify(diagnostics, null, 2)}</pre>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <iframe
        ref={iframeRef}
        title={block.title ?? manifest.bundleId}
        src={assetUrl}
        sandbox={MCP_APP_SANDBOX_ATTR}
        onError={() => {
          setLoadFailed(true);
          onFallback?.();
        }}
        style={{
          width: "100%",
          minHeight: 360,
          border: "1px solid #dbe3ef",
          borderRadius: 10,
          background: "#fff",
        }}
      />
      {devMode && (
        <details>
          <summary style={{ fontSize: 12, color: "#64748b", cursor: "pointer" }}>Bridge diagnostics</summary>
          <pre style={diagnosticsStyle}>{JSON.stringify({ manifest, diagnostics }, null, 2)}</pre>
        </details>
      )}
    </div>
  );
};

const fallbackStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "#f9fafb",
  color: "#374151",
  lineHeight: 1.5,
  display: "grid",
  gap: 6,
};

const diagnosticsStyle: React.CSSProperties = {
  margin: 0,
  padding: 10,
  background: "#0f172a",
  color: "#e2e8f0",
  borderRadius: 8,
  fontSize: 11,
  overflow: "auto",
  maxHeight: 220,
};
