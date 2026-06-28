import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import type { GraphCanvasNode, GraphQueryResponse } from "@studyagent/schemas";
import { notebookGraphQueryOptions } from "@studyagent/api-client";
import { buildIntentAwareLayout, getLearnerNodeTitle } from "../../../whiteboard-utils.js";
import { apiClient } from "../lib/api-client.js";
import {
  FolioNode,
  mapGraphNodeSize,
  mapGraphNodeType,
  type FolioNodeState,
} from "../graph/FolioNode.js";
import { FolioEmptyState, FolioErrorNotice, FolioSkeleton } from "../primitives.js";

type FolioFlowNodeData = {
  canvasNode: GraphCanvasNode;
  folioState: FolioNodeState;
  onSelect: () => void;
  onOpenEvidence: () => void;
};

function FolioFlowNode({ data }: NodeProps<Node<FolioFlowNodeData>>) {
  const node = data.canvasNode;
  const folioType = mapGraphNodeType(node.nodeType);
  const size = mapGraphNodeSize(node.nodeType);
  const status = typeof node.properties.status === "string" ? node.properties.status : null;
  const progress =
    typeof node.properties.progressPercent === "number"
      ? node.properties.progressPercent
      : null;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <FolioNode
        type={folioType}
        size={size}
        state={data.folioState}
        title={getLearnerNodeTitle(node)}
        {...(status ? { meta: status } : {})}
        {...(progress != null ? { progress } : {})}
        onClick={data.onSelect}
      />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}

const nodeTypes: NodeTypes = { folio: FolioFlowNode };

function deriveNodeState(
  nodeId: string,
  selectedNodeId: string | null,
  graphData: GraphQueryResponse | undefined,
): FolioNodeState {
  if (selectedNodeId === nodeId) return "selected";
  const descriptor = graphData?.readModel?.nodeCatalog.find(
    (entry) => entry.node.id === nodeId,
  );
  if (
    descriptor?.emphasis === "current_objective" ||
    descriptor?.emphasis === "current_module" ||
    descriptor?.emphasis === "current_path"
  ) {
    return "active";
  }
  const node = graphData?.nodes.find((item) => item.id === nodeId);
  const status = node && typeof node.properties.status === "string" ? node.properties.status : null;
  if (status === "completed" || status === "mastered") return "completed";
  if (status === "locked") return "locked";
  return "default";
}

export function FolioStudyMap({
  notebookId,
  selectedNodeId,
  onSelectNode,
  onOpenEvidence,
  graphRefreshToken = 0,
}: {
  notebookId: string;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null, node?: GraphCanvasNode) => void;
  onOpenEvidence: (nodeId: string, title: string, nodeType: string) => void;
  graphRefreshToken?: number;
}) {
  const graphQuery = useQuery({
    ...notebookGraphQueryOptions(apiClient.request, notebookId, { name: "study_map", limit: 200 }),
    enabled: Boolean(notebookId),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FolioFlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const graphData = graphQuery.data;

  const rebuildGraph = useCallback(
    (data: GraphQueryResponse) => {
      const laid = buildIntentAwareLayout({ graphData: data, savedPositions: {} });

      const flowEdges: Edge[] = data.edges.map((edge) => {
        const highlighted = selectedNodeId === edge.source || selectedNodeId === edge.target;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "smoothstep",
          animated: highlighted,
          style: {
            strokeWidth: highlighted ? 2 : 1.25,
            stroke: highlighted ? "var(--accent)" : "var(--border)",
          },
        };
      });

      const flowNodes: Node<FolioFlowNodeData>[] = laid.map(({ node, position }) => ({
        id: node.id,
        type: "folio",
        position,
        data: {
          canvasNode: node,
          folioState: deriveNodeState(node.id, selectedNodeId, data),
          onSelect: () => onSelectNode(node.id, node),
          onOpenEvidence: () =>
            onOpenEvidence(node.id, getLearnerNodeTitle(node), node.nodeType),
        },
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    },
    [onOpenEvidence, onSelectNode, selectedNodeId, setEdges, setNodes],
  );

  useEffect(() => {
    if (!graphData) return;
    rebuildGraph(graphData);
  }, [graphData, graphRefreshToken, rebuildGraph, selectedNodeId]);

  const listFallback = useMemo(() => {
    if (!graphData?.nodes.length) return [];
    return graphData.nodes.slice(0, 12);
  }, [graphData]);

  if (graphQuery.isLoading) {
    return <FolioSkeleton className="m-4 h-[min(60vh,520px)] w-[calc(100%-2rem)]" />;
  }

  if (graphQuery.isError) {
    return (
      <div className="p-4">
        <FolioErrorNotice
          title="Study map unavailable"
          message={
            graphQuery.error instanceof Error
              ? graphQuery.error.message
              : "We could not load the graph."
          }
          onRetry={() => void graphQuery.refetch()}
        />
      </div>
    );
  }

  if (!graphData?.nodes.length) {
    return (
      <FolioEmptyState
        title="Study map is building"
        description="Upload sources and wait for curriculum projection to populate your map."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="folio-graph-canvas hidden min-h-0 flex-1 md:block">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          minZoom={0.35}
          maxZoom={1.4}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} color="var(--border)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      <div className="border-t border-border p-3 md:hidden">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Study destinations
        </p>
        <ul className="space-y-2">
          {listFallback.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                className="w-full rounded-[var(--radius)] border border-border bg-card px-3 py-2 text-left"
                onClick={() => onSelectNode(node.id, node)}
              >
                <span className="block font-display text-[14px] font-medium">
                  {getLearnerNodeTitle(node)}
                </span>
                <span className="text-[11px] text-muted-foreground">{node.nodeType}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
