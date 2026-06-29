import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphCanvasNode, GraphQueryResponse } from "@studyagent/schemas";
import { learnerFacingNodeTypeLabel, learnerFacingPipelineStatus } from "@studyagent/schemas";
import {
  buildIntentAwareLayout,
  getLearnerNodeTitle,
  learnerMasteryMetaFromNode,
  learnerPageReadinessFromNode,
} from "../../whiteboard-utils.js";
import { apiClient } from "../../platform/api-client.js";
import { Skeleton } from "../ui/primitives.js";

type StudyMapNodeData = {
  title: string;
  nodeType: string;
  status: string | null;
  pageReadiness: string | null;
  meta: string | null;
  isSelected: boolean;
  onSelect: () => void;
};

function FolioStudyNode({ data }: { data: StudyMapNodeData }) {
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <button
        type="button"
        onClick={data.onSelect}
        className="folio-graph-node"
        data-selected={data.isSelected}
      >
        <div className="folio-graph-node-meta">
          <span className="folio-graph-node-type">
            {learnerFacingNodeTypeLabel(data.nodeType)}
          </span>
          {data.pageReadiness ? (
            <span className="folio-graph-node-badge">{data.pageReadiness}</span>
          ) : data.status ? (
            <span className="folio-graph-node-badge">{learnerFacingPipelineStatus(data.status)}</span>
          ) : null}
        </div>
        <div className="folio-graph-node-title">{data.title}</div>
        {data.meta ? <div className="folio-graph-node-foot">{data.meta}</div> : null}
      </button>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}

const nodeTypes: NodeTypes = { folioStudy: FolioStudyNode };

export function FolioStudyMap({
  notebookId,
  graphData,
  selectedNodeId,
  onSelectNode,
  layoutVersion = 0,
}: {
  notebookId: string;
  graphData: GraphQueryResponse | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  layoutVersion?: number;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );

  useEffect(() => {
    void apiClient
      .getGraphLayout(notebookId)
      .then(setSavedPositions)
      .catch(() => setSavedPositions({}));
  }, [notebookId, layoutVersion]);

  useEffect(() => {
    if (!graphData?.nodes?.length) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const laid = buildIntentAwareLayout({ graphData, savedPositions, alreadyPrepared: true });

    const newEdges: Edge[] = graphData.edges.map((edge) => {
      const highlighted = selectedNodeId === edge.source || selectedNodeId === edge.target;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: highlighted,
        style: {
          strokeWidth: highlighted ? 2 : 1.25,
          stroke: highlighted ? "var(--accent)" : "color-mix(in oklab, var(--border) 80%, var(--foreground))",
        },
      };
    });

    const newNodes: Node[] = laid.map(({ node, position }) => ({
      id: node.id,
      type: "folioStudy",
      position,
      data: nodeData(node, node.id === selectedNodeId, () =>
        onSelectNode(node.id === selectedNodeId ? null : node.id),
      ),
    }));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [graphData, savedPositions, selectedNodeId, onSelectNode, setNodes, setEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type !== "position" || !change.position || !change.dragging) continue;
        const node = graphData?.nodes.find((n) => n.id === change.id);
        if (!node) continue;
        void apiClient.saveGraphNodeLayout(notebookId, change.id, {
          position: change.position,
          nodeType: node.nodeType,
          refType: typeof node.properties.refType === "string" ? node.properties.refType : "node",
        });
      }
    },
    [graphData?.nodes, notebookId, onNodesChange],
  );

  if (!graphData) {
    return (
      <div className="grid h-full place-items-center p-8">
        <Skeleton className="h-40 w-full max-w-md" />
      </div>
    );
  }

  if (!graphData.nodes.length) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <p className="max-w-sm text-[14px] text-muted-foreground">
          No study map nodes yet. Upload sources and let ingestion finish to build your map.
        </p>
      </div>
    );
  }

  return (
    <div className="folio-study-map h-full min-h-[320px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.35}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

function nodeData(
  node: GraphCanvasNode,
  isSelected: boolean,
  onSelect: () => void,
): StudyMapNodeData {
  return {
    title: getLearnerNodeTitle(node),
    nodeType: node.nodeType,
    status: typeof node.properties.status === "string" ? node.properties.status : null,
    pageReadiness: learnerPageReadinessFromNode(node),
    meta: learnerMasteryMetaFromNode(node),
    isSelected,
    onSelect,
  };
}
