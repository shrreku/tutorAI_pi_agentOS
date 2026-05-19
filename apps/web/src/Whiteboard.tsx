import React, { useCallback, useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { GraphCanvasNode, GraphQueryResponse } from "@studyagent/schemas";
import { GraphCanvas } from "./GraphCanvas.js";
import { ProvenanceDrawer } from "./ProvenanceDrawer.js";
import { NodeDetailPanel } from "./NodeDetailPanel.js";
import FullPanelViewer from "./FullPanelViewer.js";
import { DeveloperTimelinePanel } from "./DeveloperTimelinePanel.js";
import {
  buildCurriculumOutline,
  resolveWorkspaceGraph,
  topicsFromReadModel,
  collapseObjectiveHistory,
  limitLearnerGraphDensity,
  promoteCurrentPathConcepts,
  type CurriculumOutline,
  type CurriculumObjectiveOutline,
  type TopicLayer,
} from "./whiteboard-utils.js";
import { mapGraphNodeToNodeRef, mapGraphNodeTypeToRefType } from "./whiteboard-node-ref.js";

interface WhiteboardProps {
  notebookId: string;
  onSelectedNodeRefsChange?: (refs: Array<{ refType: string; refId: string }>) => void;
  externalRefreshToken?: number;
}

type ViewMode = "curriculum" | "study_map" | "source_wiki_map";
const NODE_TYPES = [
  "source",
  "source_section",
  "topic",
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
    currentObjective: { id: string; title: string } | null;
    upcomingObjectives: Array<{ title: string }>;
    completedObjectives: unknown[];
    weakConcepts: Array<{ name: string }>;
  } | null;
  coverage: {
    total: number;
    planned: number;
    introduced: number;
    checked: number;
    mastered: number;
    needsReview: number;
    gaps: Array<{ title: string; itemFamily: string; status: string }>;
  };
};

type RightPanelMode = "workspace" | "viewer";

export const Whiteboard: React.FC<WhiteboardProps> = ({ notebookId, onSelectedNodeRefsChange, externalRefreshToken }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("study_map");
  const [showProvenance, setShowProvenance] = useState(false);
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>("workspace");

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
      isDeveloperMode,
      externalRefreshToken ?? 0,
    ],
    enabled: viewMode === "curriculum" || viewMode === "study_map" || Boolean(selectedSourceId),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GraphQueryResponse> => {
      const body =
        viewMode === "source_wiki_map" && selectedSourceId
          ? { name: viewMode, sourceId: selectedSourceId, limit: 80, devMode: isDeveloperMode }
          : { name: "study_map", limit: 80, devMode: isDeveloperMode };

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

  const { data: curriculumReadModel } = useQuery({
    queryKey: ["curriculum-outline", notebookId, externalRefreshToken ?? 0],
    enabled: viewMode === "curriculum",
    queryFn: async (): Promise<CurriculumOutline> => {
      const response = await fetch(`/api/v1/notebooks/${notebookId}/curriculum-outline`);
      if (!response.ok) {
        throw new Error(`Failed to load curriculum outline (${response.status})`);
      }
      return (await response.json()) as CurriculumOutline;
    },
  });

  const error = graphError instanceof Error ? graphError.message : null;
  const isLoading = isGraphLoading && !graphData;

  const topicLayer: TopicLayer[] =
    graphData && viewMode === "source_wiki_map" && selectedSourceId
      ? topicsFromReadModel(graphData, selectedSourceId)
      : [];

  useEffect(() => {
    if (!selectedNodeId) return;
    if (graphData?.nodes.some((node) => node.id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [graphData, selectedNodeId]);

  useEffect(() => {
    if (rightPanelMode === "viewer" && !selectedNodeId) {
      setRightPanelMode("workspace");
    }
  }, [rightPanelMode, selectedNodeId]);

  const handleLayoutChange = async (nodeId: string, position: { x: number; y: number }, nodeType?: string) => {
    try {
      await fetch(`/api/v1/notebooks/${notebookId}/graph/layout/${nodeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position,
          nodeType: nodeType ?? "unknown",
          refType: mapGraphNodeTypeToRefType(nodeType ?? "unknown"),
        }),
      });
    } catch (err) {
      console.error("Failed to save layout:", err);
    }
  };

  // GF-0605: propagate selected node as nodeRef upward
  // GF-1 (NEW): When clicking a node, enter viewer mode
  const handleNodeSelect = useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
      if (nodeId) {
        setRightPanelMode("viewer");
      }
      if (!onSelectedNodeRefsChange) return;
      if (!nodeId) {
        onSelectedNodeRefsChange([]);
        return;
      }
      const node = graphData?.nodes.find((n) => n.id === nodeId);
      if (node) {
        onSelectedNodeRefsChange([mapGraphNodeToNodeRef(node)]);
      }
    },
    [graphData, onSelectedNodeRefsChange],
  );

  // GF-1 (NEW): Return from viewer to workspace
  const handleExitViewer = useCallback(() => {
    setRightPanelMode("workspace");
    // Keep node selected for reference but hide the viewer
  }, []);

  const handleDraftTutorPrompt = useCallback(
    (prompt: string, node: GraphCanvasNode) => {
      onSelectedNodeRefsChange?.([mapGraphNodeToNodeRef(node)]);
      window.dispatchEvent(new CustomEvent("studyagent:tutor-draft-prompt", { detail: { prompt, mode: "wiki_maintenance" } }));
    },
    [onSelectedNodeRefsChange],
  );

  const selectedNode = graphData?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const curriculumOutline = curriculumReadModel ?? (graphData ? buildCurriculumOutline(graphData) : null);

  // GF-0607: filtered graph data (type + status)
  // GF-3A: Promote current-path concepts in study_map mode
  const filteredGraphData: GraphQueryResponse | null = graphData
    ? (() => {
        const byDefaultVisibility = resolveWorkspaceGraph(graphData, viewMode, isDeveloperMode);
        const nodePassesType = (n: GraphQueryResponse["nodes"][number]) =>
          activeTypeFilters.size === 0 || activeTypeFilters.has(n.nodeType);
        const nodePassesStatus = (n: GraphQueryResponse["nodes"][number]) => {
          if (activeStatusFilters.size === 0) return true;
          const status = typeof n.properties.status === "string" ? n.properties.status : undefined;
          return status !== undefined && activeStatusFilters.has(status);
        };
        const filteredNodes = byDefaultVisibility.nodes.filter((n) => nodePassesType(n) && nodePassesStatus(n));
        const visibleIds = new Set(filteredNodes.map((n) => n.id));
        const filteredEdges =
          activeTypeFilters.size === 0 && activeStatusFilters.size === 0
            ? byDefaultVisibility.edges
            : byDefaultVisibility.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

        if (viewMode === "study_map" && studyState?.studyPlan?.currentObjective) {
          const readModelPathIds = graphData.readModel?.emphasis.currentPathConceptIds ?? [];
          const currentObjectiveId = studyState.studyPlan.currentObjective.id;
          const relatedConceptIds = new Set(
            readModelPathIds.length > 0
              ? readModelPathIds
              : byDefaultVisibility.edges.flatMap((edge) => {
                  if (edge.source === currentObjectiveId) {
                    return byDefaultVisibility.nodes.some((node) => node.id === edge.target && node.nodeType === "concept")
                      ? [edge.target]
                      : [];
                  }
                  if (edge.target === currentObjectiveId) {
                    return byDefaultVisibility.nodes.some((node) => node.id === edge.source && node.nodeType === "concept")
                      ? [edge.source]
                      : [];
                  }
                  return [];
                }),
          );
          const currentPathIds = Array.from(relatedConceptIds);
          const promoted = promoteCurrentPathConcepts(
            { ...byDefaultVisibility, nodes: filteredNodes, edges: filteredEdges },
            currentPathIds,
          );
          return isDeveloperMode ? promoted : limitLearnerGraphDensity(collapseObjectiveHistory(promoted), 80);
        }
        const filtered = { ...byDefaultVisibility, nodes: filteredNodes, edges: filteredEdges };
        return viewMode === "study_map" && !isDeveloperMode ? limitLearnerGraphDensity(collapseObjectiveHistory(filtered), 80) : filtered;
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

  return (
    <div className="whiteboard-shell" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header toolbar */}
      <div
        className="whiteboard-toolbar"
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--line)",
          backgroundColor: "var(--panel-strong)",
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* GF-0608: View mode toggles */}
        <div className="whiteboard-mode-group">
          <span className="whiteboard-toolbar-label">Mode</span>
          {(["curriculum", "study_map", "source_wiki_map"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className="study-chip-button"
              data-active={viewMode === mode}
              style={{ padding: "6px 10px", fontSize: 11 }}
            >
              {mode === "curriculum" ? "Curriculum" : mode === "study_map" ? "Study Map" : "Source Wiki"}
            </button>
          ))}
        </div>

        {/* GF-0608: Source picker for source_wiki_map */}
        {viewMode === "source_wiki_map" && sources.length > 0 && (
          <select
            value={selectedSourceId ?? ""}
            onChange={(e) => setSelectedSourceId(e.target.value)}
            aria-label="Source Wiki source"
            style={{ fontSize: 11, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)", color: "var(--text)" }}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}

        <div style={{ flex: 1 }} />

        {/* GF-0608: Topic layer display for source_wiki_map */}
        {viewMode === "source_wiki_map" && topicLayer.length > 0 && (
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)" }}>Topics</span>
            {topicLayer.map((topic) => (
              <span key={topic.id} style={{ fontSize: 10, padding: "3px 7px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)" }}>
                {topic.title} ({topic.conceptCount} concepts)
              </span>
            ))}
          </div>
        )}

        <div className="whiteboard-filter-menu">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="study-chip-button"
            data-active={showFilters || (activeTypeFilters.size + activeStatusFilters.size) > 0}
            aria-expanded={showFilters}
          >
            Filters{(activeTypeFilters.size + activeStatusFilters.size) > 0 ? ` (${activeTypeFilters.size + activeStatusFilters.size})` : ""}
          </button>
          {showFilters && (
            <div className="whiteboard-filter-popover">
              <details open>
                <summary>Node type</summary>
                <div className="whiteboard-filter-options">
                  {NODE_TYPES.map((type) => {
                    const active = activeTypeFilters.has(type);
                    return (
                      <button key={type} type="button" onClick={() => toggleTypeFilter(type)} data-active={active}>
                        {type.replace(/_/g, " ")}
                      </button>
                    );
                  })}
                </div>
              </details>
              <details>
                <summary>Status</summary>
                <div className="whiteboard-filter-options">
                  {STATUS_OPTIONS.map((status) => {
                    const active = activeStatusFilters.has(status);
                    return (
                      <button key={status} type="button" onClick={() => toggleStatusFilter(status)} data-active={active}>
                        {status.replace(/_/g, " ")}
                      </button>
                    );
                  })}
                </div>
              </details>
              {(activeTypeFilters.size > 0 || activeStatusFilters.size > 0) && (
                <button
                  type="button"
                  className="whiteboard-filter-clear"
                  onClick={() => { setActiveTypeFilters(new Set()); setActiveStatusFilters(new Set()); }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* GF-0607: Refresh graph */}
        <button
          onClick={() => void refetchGraph()}
          title="Reload graph data"
          className="study-icon-button"
          style={{
            width: 32,
            height: 32,
            fontSize: 11,
          }}
        >
          ↺
        </button>

        {/* GF-0607: Clear saved layout positions */}
        <button
          onClick={() => void handleClearLayout()}
          title="Clear all saved positions and reset to auto-layout"
          className="study-secondary-button"
          style={{
            padding: "6px 10px",
            fontSize: 11,
          }}
        >
          Auto-layout
        </button>

        {/* Evidence toggle */}
        {selectedNode && (
          <button
            onClick={() => setShowProvenance(!showProvenance)}
            className="study-chip-button"
            data-active={showProvenance}
            style={{
              padding: "6px 10px",
              fontSize: 11,
            }}
          >
            Evidence
          </button>
        )}

        {/* Dev mode */}
        <button
          onClick={() => setIsDeveloperMode(!isDeveloperMode)}
          className="study-chip-button"
          data-active={isDeveloperMode}
          style={{
            padding: "6px 10px",
            backgroundColor: isDeveloperMode ? "var(--text-strong)" : undefined,
            color: isDeveloperMode ? "var(--panel)" : undefined,
            fontSize: 11,
          }}
        >
          Dev
        </button>
      </div>

      {/* Graph stats bar */}
      {filteredGraphData && !isLoading && (
        <div className="whiteboard-statusbar">
          <strong>
            {viewMode === "source_wiki_map" ? "Source Wiki" : viewMode === "study_map" ? "Study Map" : "Curriculum"}
          </strong>
          <span>{filteredGraphData.nodes.length} nodes</span>
          <span>{filteredGraphData.edges.length} edges</span>
          {(activeTypeFilters.size + activeStatusFilters.size) > 0 && (
            <span style={{ color: "var(--accent)" }}>
              {graphData!.nodes.length - filteredGraphData.nodes.length} filtered
            </span>
          )}
          {selectedNode && (
            <span style={{ color: "var(--accent)" }}>
              Selected: {(selectedNode.properties.title as string) ?? selectedNode.id.slice(0, 12)}
            </span>
          )}
          {studyState?.studyPlan?.currentObjective && !selectedNode && (
            <span style={{ color: "var(--text)" }}>
              Current: {studyState.studyPlan.currentObjective.title}
            </span>
          )}
          {graphData?.readModel?.projectionWarning && (
            <span style={{ color: "var(--warn, #9a6700)" }}>{graphData.readModel.projectionWarning}</span>
          )}
        </div>
      )}

      {/* Main Canvas + Right Panel Mode */}
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

        {viewMode === "curriculum" && rightPanelMode === "workspace" && !isLoading && !error && curriculumOutline && (
          <CurriculumBrowser
            outline={curriculumOutline}
            studyState={studyState ?? null}
            currentObjectiveId={studyState?.studyPlan?.currentObjective?.id ?? studyState?.objectiveList?.currentObjectiveId ?? null}
            onOpenNode={(nodeId) => handleNodeSelect(nodeId)}
          />
        )}

        {/* GF-1 (NEW): Right panel mode state machine */}
        {rightPanelMode === "workspace" && viewMode !== "curriculum" && (
          <>
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
            
            {/* GF-0604: Node Detail Panel Overlay (workspace mode only) */}
            {selectedNode && !showProvenance && (
              <NodeDetailPanel
                node={selectedNode}
                onClose={() => handleNodeSelect(null)}
                onLaunchTutor={(node) => {
                  if (onSelectedNodeRefsChange) {
                    onSelectedNodeRefsChange([mapGraphNodeToNodeRef(node)]);
                  }
                }}
                onShowProvenance={() => setShowProvenance(true)}
              />
            )}
          </>
        )}

        {/* GF-1 (NEW): Full-panel viewer mode */}
        {rightPanelMode === "viewer" && selectedNode && (
          <FullPanelViewer
            notebookId={notebookId}
            node={selectedNode}
            onClose={handleExitViewer}
            onLaunchTutor={(node) => {
              if (onSelectedNodeRefsChange) {
                onSelectedNodeRefsChange([mapGraphNodeToNodeRef(node)]);
              }
            }}
            onShowProvenance={() => setShowProvenance(true)}
            onDraftTutorPrompt={handleDraftTutorPrompt}
          />
        )}
      </div>

      {/* Evidence drawer - overlays both workspace and viewer modes */}
      {isDeveloperMode && (
        <div style={{ borderTop: "1px solid var(--line)", background: "var(--panel-strong)" }}>
          <DeveloperTimelinePanel
            notebookId={notebookId}
            onSelectNodeRefs={(refs) => {
              onSelectedNodeRefsChange?.(refs);
            }}
          />
        </div>
      )}

      {/* Evidence drawer - overlays both workspace and viewer modes */}
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

function CurriculumBrowser({
  outline,
  studyState,
  currentObjectiveId,
  onOpenNode,
}: {
  outline: CurriculumOutline;
  studyState: StudyStateSummary | null;
  currentObjectiveId: string | null;
  onOpenNode: (nodeId: string) => void;
}) {
  const objectives = outline.modules.flatMap((module) => module.objectives).concat(outline.orphanObjectives);
  const completedCount = objectives.filter((objective) => objective.status === "completed" || objective.status === "mastered").length;

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#fff", padding: "20px clamp(16px, 3vw, 40px)" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 16, marginBottom: 18, borderBottom: "1px solid #e5e7eb" }}>
          <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>Course</span>
          <strong style={{ fontSize: 18, lineHeight: 1.2, color: "#111827" }}>{outline.curriculum?.title ?? "Curriculum"}</strong>
          <span style={{ padding: "3px 8px", background: "#f3f4f6", borderRadius: 9999, fontSize: 12 }}>{outline.modules.length} modules</span>
          <span style={{ padding: "3px 8px", background: "#f3f4f6", borderRadius: 9999, fontSize: 12 }}>{objectives.length} objectives</span>
          <span style={{ padding: "3px 8px", background: "#ecfdf5", color: "#047857", borderRadius: 9999, fontSize: 12 }}>{completedCount} completed</span>
          {studyState?.coverage && (
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "#4b5563", fontSize: 12 }}>
              <span>Planned <strong style={{ color: "#111827" }}>{studyState.coverage.planned}</strong></span>
              <span>Introduced <strong style={{ color: "#111827" }}>{studyState.coverage.introduced}</strong></span>
              <span>Checked <strong style={{ color: "#111827" }}>{studyState.coverage.checked}</strong></span>
              <span>Review <strong style={{ color: "#111827" }}>{studyState.coverage.needsReview}</strong></span>
            </span>
          )}
        </div>

        <main style={{ minWidth: 0 }}>
          <div style={{ color: "#6b7280", fontSize: 16, marginBottom: 20 }}>Course syllabus</div>
          {outline.modules.length === 0 && outline.orphanObjectives.length === 0 ? (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 18, color: "#6b7280", background: "#f9fafb" }}>
              No curriculum path is available yet. The tutor chat can build the first plan after sources are ready.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 30, borderLeft: "2px solid #e5e7eb", paddingLeft: 28 }}>
              {outline.modules.map((module, moduleIndex) => (
                <details key={module.id} open={module.objectives.some((objective) => objective.id === currentObjectiveId) || moduleIndex === 0} style={{ position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: -38,
                      top: 2,
                      width: 18,
                      height: 18,
                      borderRadius: 9999,
                      border: "3px solid #6b7280",
                      background: "#fff",
                    }}
                  />
                  <summary
                    style={{
                      cursor: "pointer",
                      color: "#111827",
                      listStyle: "none",
                    }}
                  >
                    <div style={{ fontSize: 22, lineHeight: 1.25, fontWeight: 800 }}>
                      Module {moduleIndex + 1}: {module.title}
                    </div>
                  </summary>
                  <button type="button" onClick={() => onOpenNode(module.id)} style={{ marginTop: 6, border: "1px solid #d1d5db", background: "#fff", borderRadius: 999, padding: "2px 8px", color: "#374151", fontSize: 12, cursor: "pointer" }}>
                    Open module
                  </button>
                  {module.summary && <p style={{ color: "#374151", fontSize: 15, lineHeight: 1.5, margin: "8px 0 16px" }}>{module.summary}</p>}
                  <ObjectiveList objectives={module.objectives} currentObjectiveId={currentObjectiveId} onOpenNode={onOpenNode} />
                </details>
              ))}

              {outline.orphanObjectives.length > 0 && (
                <section style={{ position: "relative" }}>
                  <div style={{ fontSize: 22, lineHeight: 1.25, fontWeight: 800 }}>Objectives</div>
                  <ObjectiveList objectives={outline.orphanObjectives} currentObjectiveId={currentObjectiveId} onOpenNode={onOpenNode} />
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ObjectiveList({
  objectives,
  currentObjectiveId,
  onOpenNode,
}: {
  objectives: CurriculumObjectiveOutline[];
  currentObjectiveId: string | null;
  onOpenNode: (nodeId: string) => void;
}) {
  if (objectives.length === 0) {
    return <div style={{ color: "#9ca3af", fontSize: 14, marginTop: 12 }}>No objectives recorded.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
      {objectives.map((objective, index) => {
        const isCurrent = objective.id === currentObjectiveId;
        const isDone = objective.status === "completed" || objective.status === "mastered";
        return (
          <div
            key={objective.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenNode(objective.id)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onOpenNode(objective.id);
            }}
            style={{
              display: "grid",
              gridTemplateColumns: "28px minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "start",
              textAlign: "left",
              background: isCurrent ? "#eff6ff" : "transparent",
              border: isCurrent ? "1px solid #bfdbfe" : "1px solid transparent",
              borderRadius: 8,
              padding: "10px 12px",
              cursor: "pointer",
              color: "#111827",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 9999,
                border: `2px solid ${isDone ? "#22c55e" : isCurrent ? "#2563eb" : "#d1d5db"}`,
                background: isDone ? "#22c55e" : "#fff",
                marginTop: 3,
              }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 16, fontWeight: 800 }}>
                {index + 1}. {objective.title}
              </span>
              {objective.summary && <span style={{ display: "block", color: "#6b7280", marginTop: 3, lineHeight: 1.45 }}>{objective.summary}</span>}
            </span>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", color: "#6b7280", fontSize: 12 }}>
              {isCurrent && <span style={{ color: "#1d4ed8", fontWeight: 700 }}>Current</span>}
              <InlineNodeList label="session" nodeIds={objective.sessionIds} onOpenNode={onOpenNode} />
              <InlineNodeList label="artifact" nodeIds={objective.artifactIds} onOpenNode={onOpenNode} />
              <InlineNodeList label="concept" nodeIds={objective.conceptIds} onOpenNode={onOpenNode} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function InlineNodeList({ label, nodeIds, onOpenNode }: { label: string; nodeIds: string[]; onOpenNode: (nodeId: string) => void }) {
  if (nodeIds.length === 0) return null;
  const shown = nodeIds.slice(0, 3);
  return (
    <>
      {shown.map((nodeId, index) => (
        <InlineOpenButton
          key={nodeId}
          label={nodeIds.length === 1 ? label : `${label} ${index + 1}`}
          nodeId={nodeId}
          onOpenNode={onOpenNode}
        />
      ))}
      {nodeIds.length > shown.length && <span style={{ color: "#6b7280", padding: "1px 0" }}>+{nodeIds.length - shown.length} more</span>}
    </>
  );
}

function InlineOpenButton({ label, nodeId, onOpenNode }: { label: string; nodeId: string; onOpenNode: (nodeId: string) => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onOpenNode(nodeId);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onOpenNode(nodeId);
      }}
      style={{
        color: "#2563eb",
        fontWeight: 700,
        cursor: "pointer",
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        borderRadius: 9999,
        padding: "1px 7px",
      }}
    >
      {label}
    </span>
  );
}

export default Whiteboard;
