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

interface CustomNodeData {
  title: string;
  nodeType: string;
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
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          background: bgColor,
          color: "white",
          fontSize: 11,
          fontWeight: data.isSelected ? 700 : 500,
          cursor: "pointer",
          border: data.isSelected ? "2px solid #fbbf24" : "2px solid transparent",
          opacity,
          transition: "all 150ms",
          whiteSpace: "nowrap",
          maxWidth: 160,
          overflow: "hidden",
          textOverflow: "ellipsis",
          boxShadow: data.isSelected ? "0 0 0 3px rgba(251,191,36,0.4)" : "none",
        }}
      >
        {data.title}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
};

const nodeTypes: NodeTypes = { studyagent: StudyAgentNode };

function buildLayout(nodes: GraphCanvasNode[], savedPositions: Record<string, { x: number; y: number }>) {
  return nodes.map((node, idx) => {
    const saved = savedPositions[node.id];
    const position = saved ?? {
      x: (idx % 6) * 210,
      y: Math.floor(idx / 6) * 160,
    };
    return { node, position };
  });
}

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

    const laid = buildLayout(graphData.nodes, savedPositions);

    const newEdges: Edge[] = graphData.edges.map((edge) => ({
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
        title:
          (node.properties.title as string) ??
          (node.properties.canonicalName as string) ??
          (node.properties.canonical_name as string) ??
          node.id.slice(0, 12),
        nodeType: node.nodeType,
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#9ca3af",
          fontSize: 14,
        }}
      >
        No graph data yet. Ingest a source to build the graph.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
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
      >
        <Background color="#e5e7eb" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={miniMapNodeColor}
          style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}
        />
      </ReactFlow>
    </div>
  );
};
