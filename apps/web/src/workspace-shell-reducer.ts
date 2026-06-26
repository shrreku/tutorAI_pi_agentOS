export type WorkspaceViewMode = "curriculum" | "study_map" | "source_wiki_map";
export type WorkspaceRightPanelMode = "workspace" | "viewer";

export type WorkspaceShellState = {
  selectedNodeId: string | null;
  viewMode: WorkspaceViewMode;
  showEvidence: boolean;
  isDeveloperMode: boolean;
  rightPanelMode: WorkspaceRightPanelMode;
  selectedSourceId: string | null;
  activeTypeFilters: string[];
  activeStatusFilters: string[];
  showFilters: boolean;
  layoutVersion: number;
};

export type WorkspaceShellAction =
  | { type: "selectNode"; nodeId: string | null }
  | { type: "closeViewer" }
  | { type: "setViewMode"; viewMode: WorkspaceViewMode }
  | { type: "setSelectedSource"; sourceId: string | null }
  | { type: "toggleEvidence" }
  | { type: "closeEvidence" }
  | { type: "setDeveloperMode"; enabled: boolean }
  | { type: "removeMissingSelectedNode"; availableNodeIds: string[] }
  | { type: "toggleTypeFilter"; filter: string }
  | { type: "toggleStatusFilter"; filter: string }
  | { type: "clearFilters" }
  | { type: "setShowFilters"; show: boolean }
  | { type: "incrementLayoutVersion" };

export const initialWorkspaceShellState: WorkspaceShellState = {
  selectedNodeId: null,
  viewMode: "study_map",
  showEvidence: false,
  isDeveloperMode: false,
  rightPanelMode: "workspace",
  selectedSourceId: null,
  activeTypeFilters: [],
  activeStatusFilters: [],
  showFilters: false,
  layoutVersion: 0,
};

function toggleFilter(filters: string[], value: string): string[] {
  return filters.includes(value) ? filters.filter((entry) => entry !== value) : [...filters, value];
}

export function workspaceShellReducer(
  state: WorkspaceShellState,
  action: WorkspaceShellAction,
): WorkspaceShellState {
  switch (action.type) {
    case "selectNode":
      return {
        ...state,
        selectedNodeId: action.nodeId,
        rightPanelMode: action.nodeId ? "viewer" : "workspace",
        showEvidence: action.nodeId ? state.showEvidence : false,
      };
    case "closeViewer":
      return { ...state, rightPanelMode: "workspace" };
    case "setViewMode":
      return {
        ...state,
        viewMode: action.viewMode,
        rightPanelMode: action.viewMode === "curriculum" ? "workspace" : state.rightPanelMode,
        showEvidence: action.viewMode === "curriculum" ? false : state.showEvidence,
      };
    case "setSelectedSource":
      return { ...state, selectedSourceId: action.sourceId };
    case "toggleEvidence":
      return state.selectedNodeId ? { ...state, showEvidence: !state.showEvidence } : state;
    case "closeEvidence":
      return { ...state, showEvidence: false };
    case "setDeveloperMode":
      return {
        ...state,
        isDeveloperMode: action.enabled,
        showEvidence: action.enabled ? state.showEvidence : false,
      };
    case "removeMissingSelectedNode":
      if (!state.selectedNodeId || action.availableNodeIds.includes(state.selectedNodeId))
        return state;
      return { ...state, selectedNodeId: null, rightPanelMode: "workspace", showEvidence: false };
    case "toggleTypeFilter":
      return { ...state, activeTypeFilters: toggleFilter(state.activeTypeFilters, action.filter) };
    case "toggleStatusFilter":
      return {
        ...state,
        activeStatusFilters: toggleFilter(state.activeStatusFilters, action.filter),
      };
    case "clearFilters":
      return { ...state, activeTypeFilters: [], activeStatusFilters: [] };
    case "setShowFilters":
      return { ...state, showFilters: action.show };
    case "incrementLayoutVersion":
      return { ...state, layoutVersion: state.layoutVersion + 1 };
  }
}
