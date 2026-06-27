import React, { useCallback, useEffect } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MiniMap,
  type NodeChange,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphCanvasNode, GraphQueryResponse } from "@studyagent/schemas";
import { buildIntentAwareLayout, getLearnerNodeTitle, learnerMasteryMetaFromNode, learnerPageReadinessFromNode } from "./whiteboard-utils.js";
import { StudyNode, studyNodeSize } from "./kit/components/StudyNode.js";

interface GraphCanvasProps {
  graphData: GraphQueryResponse | null;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  onLayoutChange?: (nodeId: string, position: { x: number; y: number }, nodeType?: string) => void;
  notebookId?: string;
  layoutVersion?: number;
}

const NODE_COLORS: Record<string, string> = {
  concept: "#6366f1",
  source: "#16a34a",
  curriculum: "#ea580c",
  study_plan: "#2563eb",
  objective: "#7c3aed",
  artifact: "#d97706",
  claim: "#6b7280",
};

const NODE_COLOR_DEFAULT = "#94a3b8";

interface CustomNodeData {
  title: string;
  nodeType: string;
  status: string | null;
  pageReadiness: string | null;
  summary: string | null;
  meta: string | null;
  isSelected: boolean;
  isConnected: boolean;
  onSelect: () => void;
  [key: string]: unknown;
}

const StudyAgentNode: React.FC<{ data: CustomNodeData }> = ({ data }) => {
  const opacity = data.isConnected || data.isSelected ? 1 : 0.72;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <StudyNode
        as="button"
        nodeType={data.nodeType}
        title={data.title}
        summary={data.summary}
        meta={data.meta}
        status={data.status}
        pageReadiness={data.pageReadiness}
        selected={data.isSelected}
        size={studyNodeSize(data.nodeType)}
        onClick={data.onSelect}
        style={{ opacity, textAlign: "left", cursor: "pointer" }}
      />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
};

const nodeTypes: NodeTypes = { studyagent: StudyAgentNode };

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graphData,
  selectedNodeId,
  onNodeSelect,
  onLayoutChange,
  notebookId,
  layoutVersion = 0,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [savedPositions, setSavedPositions] = React.useState<Record<string, { x: number; y: number }>>({});

  // Load saved layout positions from API — re-runs when layoutVersion increments (Clear Layout)
  useEffect(() => {
    if (!notebookId) return;
    fetch(`/api/v1/notebooks/${notebookId}/graph/layout`)
      .then((r) => (r.ok ? r.json() : { positions: {} }))
      .then((d: { positions: Record<string, { x: number; y: number }> }) => setSavedPositions(d.positions ?? {}))
      .catch(() => setSavedPositions({}));
  }, [notebookId, layoutVersion]);

  // Rebuild nodes/edges whenever graphData or selectedNodeId changes
  useEffect(() => {
    if (!graphData?.nodes) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const laid = buildIntentAwareLayout({ graphData, savedPositions, alreadyPrepared: true });

    const newEdges: Edge[] = graphData.edges.map((edge) => {
      const isHighlighted = selectedNodeId === edge.source || selectedNodeId === edge.target;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        label: isHighlighted ? edge.relationType.replace(/_/g, " ") : undefined,
        animated: isHighlighted,
        style: {
          strokeWidth: isHighlighted ? 2.25 : 1.35,
          stroke: isHighlighted ? "#2563eb" : "#94a3b8",
        },
        labelStyle: { fontSize: 9, fill: "#475569", fontWeight: 600 },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.94 },
      };
    });

    const connectedNodeIds = new Set<string>();
    if (selectedNodeId) {
      connectedNodeIds.add(selectedNodeId);
      newEdges.forEach((edge) => {
        if (edge.source === selectedNodeId) connectedNodeIds.add(edge.target);
        if (edge.target === selectedNodeId) connectedNodeIds.add(edge.source);
      });
    }

    const newNodes: Node[] = laid.map(({ node, position }) => ({
      id: node.id,
      type: "studyagent",
      data: {
        title: getLearnerNodeTitle(node),
        nodeType: node.nodeType,
        status: typeof node.properties.status === "string" ? node.properties.status : null,
        pageReadiness: learnerPageReadinessFromNode(node),
        summary: getCompactSummary(node),
        meta: learnerMasteryMetaFromNode(node) ?? getCompactMeta(node),
        isSelected: node.id === selectedNodeId,
        isConnected: connectedNodeIds.has(node.id),
        onSelect: () => onNodeSelect(node.id),
      },
      position,
      draggable: true,
      selectable: true,
    }));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [graphData, selectedNodeId, savedPositions, setNodes, setEdges, onNodeSelect]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      changes.forEach((change) => {
        if (change.type === "position" && "position" in change && change.position && !change.dragging) {
          if (onLayoutChange) {
            const node = graphData?.nodes.find((n) => n.id === change.id);
            onLayoutChange(change.id, change.position, node?.nodeType);
          }
        }
      });
    },
    [onNodesChange, onLayoutChange, graphData],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect(node.id === selectedNodeId ? null : node.id);
    },
    [onNodeSelect, selectedNodeId],
  );

  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  const miniMapNodeColor = useCallback(
    (node: Node) => NODE_COLORS[(node.data as CustomNodeData).nodeType] ?? NODE_COLOR_DEFAULT,
    [],
  );

  if (!graphData?.nodes.length) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          placeItems: "center",
          color: "var(--text-muted)",
          fontSize: 14,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 340 }}>
          <div
            aria-hidden="true"
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              margin: "0 auto 12px",
              background: "var(--accent-soft)",
              color: "var(--accent)",
              fontSize: 22,
              fontWeight: 900,
            }}
          >
            ⌘
          </div>
          <div style={{ color: "var(--text-strong)", fontWeight: 850, marginBottom: 5 }}>Build the first study map</div>
          <div style={{ lineHeight: 1.45 }}>Add a source from the top bar. Sources, wiki pages, objectives, and artifacts will appear here as connected nodes.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="map-canvas graph-canvas-surface" style={{ width: "100%", height: "100%", minHeight: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={{ type: "smoothstep" }}
        style={{ background: "transparent" }}
      >
        <Background color="oklch(88% 0.018 255)" gap={22} />
        <Controls />
        <MiniMap
          nodeColor={miniMapNodeColor}
          style={{ backgroundColor: "var(--panel-muted)", border: "1px solid var(--line)", borderRadius: 8 }}
        />
      </ReactFlow>
    </div>
  );
};

function getCompactSummary(node: GraphCanvasNode): string | null {
  const properties = node.properties;
  const value = properties.summary ?? properties.description ?? properties.sessionGoal ?? properties.preview;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^bootstrap module generated from\b/i.test(trimmed)) return null;
  return trimmed.length > 0 ? trimmed : null;
}

function getCompactMeta(node: GraphCanvasNode): string | null {
  const properties = node.properties;
  if (node.nodeType === "study_plan") {
    const current = typeof properties.currentObjectiveId === "string" ? "current set" : "needs objective";
    return `Live Plan: ${current}`;
  }
  if (node.nodeType === "session_plan" && typeof properties.sessionGoal === "string") {
    return "lesson route";
  }
  if (node.nodeType === "tutor_session") {
    const mode = typeof properties.mode === "string" ? properties.mode.replace(/_/g, " ") : "chat";
    return mode;
  }
  if (node.nodeType === "objective_list") {
    return "ordered path";
  }
  if (node.nodeType === "objective") {
    const order = typeof properties.orderIndex === "number" ? `#${properties.orderIndex + 1}` : null;
    return order;
  }
  if (node.nodeType === "artifact") {
    return typeof properties.artifactType === "string" ? properties.artifactType.replace(/_/g, " ") : "reference";
  }
  if (node.nodeType === "source") {
    return typeof properties.sourceType === "string" ? properties.sourceType : null;
  }
  return null;
}
