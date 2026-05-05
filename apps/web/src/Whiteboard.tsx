import React, { useCallback, useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { GraphQueryResponse } from "@studyagent/schemas";
import { GraphCanvas } from "./GraphCanvas.js";
import { ProvenanceDrawer } from "./ProvenanceDrawer.js";
import { NodeDetailPanel } from "./NodeDetailPanel.js";

interface WhiteboardProps {
  notebookId: string;
  onSelectedNodeRefsChange?: (refs: Array<{ refType: string; refId: string }>) => void;
  externalRefreshToken?: number;
}

type ViewMode = "study_map" | "source_wiki_map";

const NODE_TYPES = [
  "source",
  "source_section",
  "curriculum",
  "curriculum_module",
  "objective",
  "objective_list",
  "study_plan",
  "session_plan",
  "coverage_item",
  "coverage_record",
  "concept",
  "wiki_page",
  "artifact",
  "tutor_session",
  "weak_concept",
  "claim",
] as const;

const STATUS_OPTIONS = [
  "active",
  "completed",
  "draft",
  "not_started",
  "published",
  "failed",
  "candidate",
  "accepted",
  "rejected",
  "tutoring_ready",
  "uploaded",
] as const;

type Source = { id: string; title: string; status: string };

type StudyStateSummary = {
  studentProfile: {
    goalSummary: string | null;
    pacePreference: string | null;
    depthPreference: string | null;
  } | null;
  curriculum: { title: string; status: string } | null;
  module: { title: string; summary: string | null; status: string } | null;
  objectiveList: { title: string; status: string; currentObjectiveId: string | null } | null;
  sessionPlan: { title: string; status: string; sessionGoal: string | null } | null;
  studyPlan: {
    currentObjective: { title: string } | null;
    upcomingObjectives: Array<{ title: string }>;
    completedObjectives: unknown[];
    weakConcepts: Array<{ name: string }>;
  } | null;
};

export const Whiteboard: React.FC<WhiteboardProps> = ({ notebookId, onSelectedNodeRefsChange, externalRefreshToken }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("study_map");
  const [showProvenance, setShowProvenance] = useState(false);
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);

  // GF-0607: type + status filters
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<string>>(new Set());
  const [activeStatusFilters, setActiveStatusFilters] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  // Track layout reset version so GraphCanvas reloads saved positions
  const [layoutVersion, setLayoutVersion] = useState(0);

  // GF-0608: source picker for source_wiki_map
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const {
    data: sources = [],
    isLoading: isSourcesLoading,
  } = useQuery({
    queryKey: ["notebook-sources", notebookId],
    enabled: viewMode === "source_wiki_map",
    queryFn: async (): Promise<Source[]> => {
      const response = await fetch(`/api/v1/notebooks/${notebookId}/sources`);
      if (!response.ok) {
        throw new Error(`Failed to load sources (${response.status})`);
      }
      const data = (await response.json()) as { sources: Source[] };
      return data.sources ?? [];
    },
  });

  useEffect(() => {
    if (viewMode !== "source_wiki_map") return;
    if (!sources.length) {
      setSelectedSourceId(null);
      return;
    }
    if (!selectedSourceId || !sources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(sources[0]!.id);
    }
  }, [viewMode, sources, selectedSourceId]);

  const { data: studyState } = useQuery({
    queryKey: ["whiteboard-study-state", notebookId],
    queryFn: async (): Promise<StudyStateSummary> => {
      const response = await fetch(`/api/v1/notebooks/${notebookId}/study-state`);
      if (!response.ok) {
        throw new Error(`Failed to load study state (${response.status})`);
      }
      return (await response.json()) as StudyStateSummary;
    },
  });

  const {
    data: graphData,
    error: graphError,
    isLoading: isGraphLoading,
    isFetching: isGraphFetching,
    refetch: refetchGraph,
  } = useQuery({
    queryKey: [
      "notebook-graph",
      notebookId,
      viewMode,
      viewMode === "source_wiki_map" ? selectedSourceId : "study_map",
      externalRefreshToken ?? 0,
    ],
    enabled: viewMode === "study_map" || Boolean(selectedSourceId),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GraphQueryResponse> => {
      const body =
        viewMode === "source_wiki_map" && selectedSourceId
          ? { name: viewMode, sourceId: selectedSourceId, limit: 80 }
          : { name: "study_map", limit: 80 };

      const response = await fetch(`/api/v1/notebooks/${notebookId}/graph/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as GraphQueryResponse;
    },
  });

  const error = graphError instanceof Error ? graphError.message : null;
  const isLoading = isGraphLoading && !graphData;

  useEffect(() => {
    if (!selectedNodeId) return;
    if (graphData?.nodes.some((node) => node.id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [graphData, selectedNodeId]);

  const handleLayoutChange = async (nodeId: string, position: { x: number; y: number }, nodeType?: string) => {
    try {
      await fetch(`/api/v1/notebooks/${notebookId}/graph/layout/${nodeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position, nodeType: nodeType ?? "unknown", refType: "whiteboard_node" }),
      });
    } catch (err) {
      console.error("Failed to save layout:", err);
    }
  };

  // GF-0605: propagate selected node as nodeRef upward
  const handleNodeSelect = useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
      if (!onSelectedNodeRefsChange) return;
      if (!nodeId) {
        onSelectedNodeRefsChange([]);
        return;
      }
      const node = graphData?.nodes.find((n) => n.id === nodeId);
      if (node) {
        onSelectedNodeRefsChange([{ refType: node.nodeType, refId: node.id }]);
      }
    },
    [graphData, onSelectedNodeRefsChange],
  );

  const selectedNode = graphData?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  // GF-0607: filtered graph data (type + status)
  const filteredGraphData: GraphQueryResponse | null = graphData
    ? (() => {
        const nodePassesType = (n: GraphQueryResponse["nodes"][number]) =>
          activeTypeFilters.size === 0 || activeTypeFilters.has(n.nodeType);
        const nodePassesStatus = (n: GraphQueryResponse["nodes"][number]) => {
          if (activeStatusFilters.size === 0) return true;
          const status = typeof n.properties.status === "string" ? n.properties.status : undefined;
          return status !== undefined && activeStatusFilters.has(status);
        };
        const filteredNodes = graphData.nodes.filter((n) => nodePassesType(n) && nodePassesStatus(n));
        const visibleIds = new Set(filteredNodes.map((n) => n.id));
        const filteredEdges =
          activeTypeFilters.size === 0 && activeStatusFilters.size === 0
            ? graphData.edges
            : graphData.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
        return { ...graphData, nodes: filteredNodes, edges: filteredEdges };
      })()
    : null;

  const toggleTypeFilter = (type: string) => {
    setActiveTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleStatusFilter = (status: string) => {
    setActiveStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleClearLayout = async () => {
    try {
      await fetch(`/api/v1/notebooks/${notebookId}/graph/layout`, { method: "DELETE" });
    } catch {
      // non-fatal
    }
    setLayoutVersion((v) => v + 1);
  };

  const nodeTypeColor: Record<string, string> = {
    concept: "#3b82f6",
    source: "#10b981",
    source_section: "#34d399",
    artifact: "#f59e0b",
    claim: "#8b5cf6",
    curriculum: "#f97316",
    objective: "#fb923c",
    study_plan: "#a78bfa",
    wiki_page: "#06b6d4",
    tutor_session: "#6b7280",
    weak_concept: "#ef4444",
  };


  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header toolbar */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* GF-0608: View mode toggles */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>VIEW:</span>
          {(["study_map", "source_wiki_map"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "3px 9px",
                backgroundColor: viewMode === mode ? "#3b82f6" : "white",
                color: viewMode === mode ? "white" : "#1f2937",
                border: "1px solid #d1d5db",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {mode === "study_map" ? "Study Map" : "Source Wiki"}
            </button>
          ))}
        </div>

        {/* GF-0608: Source picker for source_wiki_map */}
        {viewMode === "source_wiki_map" && sources.length > 0 && (
          <select
            value={selectedSourceId ?? ""}
            onChange={(e) => setSelectedSourceId(e.target.value)}
            style={{ fontSize: 11, padding: "2px 6px", border: "1px solid #d1d5db", borderRadius: 4 }}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}

        <div style={{ flex: 1 }} />

        {/* GF-0607: Filters toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            padding: "3px 9px",
            backgroundColor: (activeTypeFilters.size + activeStatusFilters.size) > 0 ? "#2563eb" : showFilters ? "#e5e7eb" : "white",
            color: (activeTypeFilters.size + activeStatusFilters.size) > 0 ? "white" : "#1f2937",
            border: "1px solid #d1d5db",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Filter{(activeTypeFilters.size + activeStatusFilters.size) > 0 ? ` (${activeTypeFilters.size + activeStatusFilters.size})` : ""}
        </button>

        {/* GF-0607: Refresh graph */}
        <button
          onClick={() => void refetchGraph()}
          title="Reload graph data"
          style={{
            padding: "3px 9px",
            backgroundColor: "white",
            color: "#1f2937",
            border: "1px solid #d1d5db",
            borderRadius: 4,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          ↺
        </button>

        {/* GF-0607: Clear saved layout positions */}
        <button
          onClick={() => void handleClearLayout()}
          title="Clear all saved positions and reset to auto-layout"
          style={{
            padding: "3px 9px",
            backgroundColor: "white",
            color: "#6b7280",
            border: "1px solid #d1d5db",
            borderRadius: 4,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Auto-layout
        </button>

        {/* Provenance toggle */}
        {selectedNode && (
          <button
            onClick={() => setShowProvenance(!showProvenance)}
            style={{
              padding: "3px 9px",
              backgroundColor: showProvenance ? "#8b5cf6" : "white",
              color: showProvenance ? "white" : "#1f2937",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Provenance
          </button>
        )}

        {/* Dev mode */}
        <button
          onClick={() => setIsDeveloperMode(!isDeveloperMode)}
          style={{
            padding: "3px 9px",
            backgroundColor: isDeveloperMode ? "#374151" : "white",
            color: isDeveloperMode ? "white" : "#1f2937",
            border: "1px solid #d1d5db",
            borderRadius: 4,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Dev
        </button>
      </div>

      {studyState && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #e5e7eb",
            background: "linear-gradient(90deg, #fff7ed 0%, #f8fafc 100%)",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            fontSize: 11,
            alignItems: "center",
          }}
        >
          {studyState.curriculum && <span style={{ padding: "2px 8px", borderRadius: 9999, background: "#ffedd5", color: "#9a3412" }}>Curriculum: {studyState.curriculum.title}</span>}
          {studyState.module && <span style={{ padding: "2px 8px", borderRadius: 9999, background: "#dcfce7", color: "#166534" }}>Module: {studyState.module.title}</span>}
          {studyState.sessionPlan && <span style={{ padding: "2px 8px", borderRadius: 9999, background: "#e0f2fe", color: "#075985" }}>Session: {studyState.sessionPlan.title}</span>}
          {studyState.objectiveList && <span style={{ padding: "2px 8px", borderRadius: 9999, background: "#f5f3ff", color: "#5b21b6" }}>Objective list: {studyState.objectiveList.title}</span>}
          {studyState.studentProfile?.goalSummary && <span style={{ padding: "2px 8px", borderRadius: 9999, background: "#fef3c7", color: "#92400e" }}>Goal: {studyState.studentProfile.goalSummary}</span>}
          {studyState.studentProfile?.pacePreference && <span style={{ padding: "2px 8px", borderRadius: 9999, background: "#ecfeff", color: "#155e75" }}>Pace: {studyState.studentProfile.pacePreference}</span>}
          {studyState.studyPlan && <span style={{ padding: "2px 8px", borderRadius: 9999, background: "#e0e7ff", color: "#3730a3" }}>Current: {studyState.studyPlan.currentObjective?.title ?? "No active objective"}</span>}
        </div>
      )}

      {/* GF-0607: Filter panel */}
      {showFilters && (
        <div
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Node type filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", minWidth: 80 }}>NODE TYPE:</span>
            {NODE_TYPES.map((type) => {
              const active = activeTypeFilters.has(type);
              const color = nodeTypeColor[type] ?? "#6b7280";
              return (
                <button
                  key={type}
                  onClick={() => toggleTypeFilter(type)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 9999,
                    border: `1px solid ${active ? color : "#d1d5db"}`,
                    background: active ? color : "white",
                    color: active ? "white" : "#374151",
                    fontSize: 11,
                    cursor: "pointer",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {type.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>

          {/* Status filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", minWidth: 80 }}>STATUS:</span>
            {STATUS_OPTIONS.map((status) => {
              const active = activeStatusFilters.has(status);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatusFilter(status)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 9999,
                    border: `1px solid ${active ? "#374151" : "#d1d5db"}`,
                    background: active ? "#374151" : "white",
                    color: active ? "white" : "#374151",
                    fontSize: 11,
                    cursor: "pointer",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {status.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>

          {(activeTypeFilters.size > 0 || activeStatusFilters.size > 0) && (
            <div>
              <button
                onClick={() => { setActiveTypeFilters(new Set()); setActiveStatusFilters(new Set()); }}
                style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Graph stats bar */}
      {filteredGraphData && !isLoading && (
        <div
          style={{
            padding: "4px 12px",
            background: "#f3f4f6",
            borderBottom: "1px solid #e5e7eb",
            fontSize: 11,
            color: "#6b7280",
            display: "flex",
            gap: 12,
          }}
        >
          <span>{filteredGraphData.nodes.length} nodes</span>
          <span>{filteredGraphData.edges.length} edges</span>
          {(activeTypeFilters.size + activeStatusFilters.size) > 0 && (
            <span style={{ color: "#2563eb" }}>
              {graphData!.nodes.length - filteredGraphData.nodes.length} filtered
            </span>
          )}
          {selectedNode && (
            <span style={{ color: "#7c3aed" }}>
              Selected: {(selectedNode.properties.title as string) ?? selectedNode.id.slice(0, 12)}
            </span>
          )}
        </div>
      )}

      {/* Main Canvas */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {isLoading && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 10,
              background: "white",
              padding: 20,
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          >
            <div style={{ color: "#6b7280", fontSize: 14 }}>Loading graph…</div>
          </div>
        )}

        {isGraphFetching && graphData && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 10,
              background: "rgba(255,255,255,0.92)",
              padding: "6px 10px",
              borderRadius: 9999,
              border: "1px solid #e5e7eb",
              fontSize: 11,
              color: "#6b7280",
            }}
          >
            Refreshing graph…
          </div>
        )}

        {error && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 10,
              background: "#fef2f2",
              padding: 20,
              borderRadius: 8,
              border: "1px solid #fecaca",
            }}
          >
            <div style={{ color: "#991b1b", fontSize: 14 }}>Error: {error}</div>
            <button
              onClick={() => void refetchGraph()}
              style={{ marginTop: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
            >
              Retry
            </button>
          </div>
        )}

        {viewMode === "source_wiki_map" && sources.length === 0 && !isLoading && !isSourcesLoading && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 10,
              textAlign: "center",
              color: "#6b7280",
            }}
          >
            <div style={{ fontSize: 14 }}>No sources in this notebook.</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Upload a source to see the wiki map.</div>
          </div>
        )}

        {!isLoading && !error && filteredGraphData && (
          <GraphCanvas
            graphData={filteredGraphData}
            selectedNodeId={selectedNodeId}
            onNodeSelect={handleNodeSelect}
            onLayoutChange={handleLayoutChange}
            notebookId={notebookId}
            layoutVersion={layoutVersion}
          />
        )}

        {/* GF-0604: Node Detail Panel */}
        {selectedNode && !showProvenance && (
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => handleNodeSelect(null)}
            onLaunchTutor={(node) => {
              if (onSelectedNodeRefsChange) {
                onSelectedNodeRefsChange([{ refType: node.nodeType, refId: node.id }]);
              }
            }}
            onShowProvenance={() => setShowProvenance(true)}
          />
        )}
      </div>

      {/* Provenance Drawer */}
      <ProvenanceDrawer
        isOpen={showProvenance}
        onClose={() => setShowProvenance(false)}
        nodeId={selectedNode?.id}
        nodeTitle={(selectedNode?.properties?.title ?? selectedNode?.properties?.canonicalName ?? selectedNode?.properties?.canonical_name) as string | undefined}
        nodeType={selectedNode?.nodeType}
        notebookId={notebookId}
        confidence={selectedNode?.properties?.confidence as number | undefined}
        metadata={
          isDeveloperMode
            ? {
                nodeId: selectedNode?.id,
                nodeType: selectedNode?.nodeType,
                labels: selectedNode?.labels,
                nodeCount: graphData?.nodes.length,
                edgeCount: graphData?.edges.length,
                ...selectedNode?.properties,
              }
            : undefined
        }
        isDeveloperMode={isDeveloperMode}
      />
    </div>
  );
};

export default Whiteboard;
