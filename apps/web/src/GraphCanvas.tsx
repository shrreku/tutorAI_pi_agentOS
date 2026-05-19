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
import { buildIntentAwareLayout, collapseObjectiveHistory, getLearnerNodeTitle } from "./whiteboard-utils.js";

interface GraphCanvasProps {
  graphData: GraphQueryResponse | null;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  onLayoutChange?: (nodeId: string, position: { x: number; y: number }, nodeType?: string) => void;
  notebookId?: string;
  layoutVersion?: number;
}

const NODE_COLORS: Record<string, string> = {
  concept: "#3b82f6",
  source: "#10b981",
  source_section: "#34d399",
  topic: "#0ea5e9",
  artifact: "#f59e0b",
  claim: "#8b5cf6",
  sub_concept: "#06b6d4",
  cross_domain_connection: "#ec4899",
  curriculum: "#f97316",
  curriculum_module: "#ea580c",
  objective: "#fb923c",
  objective_list: "#c2410c",
  study_plan: "#a78bfa",
  session_plan: "#7c3aed",
  wiki_page: "#0ea5e9",
  tutor_session: "#6b7280",
  weak_concept: "#ef4444",
  coverage_item: "#14b8a6",
  coverage_record: "#0f766e",
};

const NODE_COLOR_DEFAULT = "#6b7280";

const LEARNER_NODE_TYPE_LABELS: Record<string, string> = {
  source: "Source",
  topic: "Topic",
  concept: "Concept",
  wiki_page: "Wiki page",
  artifact: "Artifact",
  curriculum: "Curriculum",
  curriculum_module: "Module",
  objective: "Objective",
  objective_list: "Session objectives",
  study_plan: "Live Plan",
  session_plan: "Session",
};

interface CustomNodeData {
  title: string;
  nodeType: string;
  status: string | null;
  summary: string | null;
  meta: string | null;
  isSelected: boolean;
  isConnected: boolean;
  onSelect: () => void;
  [key: string]: unknown;
}

const StudyAgentNode: React.FC<{ data: CustomNodeData }> = ({ data }) => {
  const bgColor = NODE_COLORS[data.nodeType] ?? NODE_COLOR_DEFAULT;
  const opacity = data.isConnected || data.isSelected ? 1 : 0.75;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        onClick={data.onSelect}
        title={data.title}
        className="graph-study-node"
        data-selected={data.isSelected}
        style={{
          ["--node-color" as string]: bgColor,
          borderColor: data.isSelected ? bgColor : undefined,
          opacity,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 8 }}>
          <span
            style={{
              maxWidth: 92,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: bgColor,
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            {LEARNER_NODE_TYPE_LABELS[data.nodeType] ?? data.nodeType.replace(/_/g, " ")}
          </span>
          {data.status && (
            <span
              style={{
                maxWidth: 52,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                borderRadius: 999,
                background: "var(--panel-muted)",
                color: "var(--text-muted)",
                padding: "1px 6px",
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              {data.status.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <div
          style={{
            color: "var(--text-strong)",
            fontSize: 13,
            lineHeight: 1.2,
            fontWeight: data.isSelected ? 800 : 750,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {data.title}
        </div>
        {data.summary && (
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 10,
              lineHeight: 1.25,
              marginTop: 6,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.summary}
          </div>
        )}
        {data.meta && (
          <div style={{ color: "var(--text)", fontSize: 10, fontWeight: 700, marginTop: 8 }}>
            {data.meta}
          </div>
        )}
      </div>
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

    const preparedGraph = collapseObjectiveHistory(graphData);
    const laid = buildIntentAwareLayout({ graphData: preparedGraph, savedPositions });

    const newEdges: Edge[] = preparedGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.relationType.replace(/_/g, " "),
      animated: selectedNodeId === edge.source || selectedNodeId === edge.target,
      style: {
        strokeWidth: 1.5,
        stroke: selectedNodeId === edge.source || selectedNodeId === edge.target ? "#3b82f6" : "#d1d5db",
      },
      labelStyle: { fontSize: 9, fill: "#6b7280" },
      labelBgStyle: { fill: "#f9fafb", fillOpacity: 0.8 },
    }));

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
        summary: getCompactSummary(node),
        meta: getCompactMeta(node),
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
    <div className="graph-canvas-surface" style={{ width: "100%", height: "100%", background: "var(--panel-strong)" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={3}
        style={{ background: "var(--panel-strong)" }}
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
