import { describe, expect, it } from "vitest";
import { initialWorkspaceShellState, workspaceShellReducer } from "./workspace-shell-reducer.js";

describe("workspaceShellReducer", () => {
  it("selects a node by opening the Reference Surface viewer", () => {
    expect(workspaceShellReducer(initialWorkspaceShellState, { type: "selectNode", nodeId: "node_1" })).toMatchObject({
      selectedNodeId: "node_1",
      rightPanelMode: "viewer",
    });
  });

  it("normalizes impossible viewer and evidence states when selection disappears", () => {
    const selected = workspaceShellReducer(initialWorkspaceShellState, { type: "selectNode", nodeId: "node_1" });
    const withEvidence = workspaceShellReducer(selected, { type: "toggleEvidence" });
    expect(workspaceShellReducer(withEvidence, { type: "removeMissingSelectedNode", availableNodeIds: [] })).toMatchObject({
      selectedNodeId: null,
      rightPanelMode: "workspace",
      showEvidence: false,
    });
  });

  it("turns learner mode back into a non-diagnostic surface when Dev Mode is disabled", () => {
    const selected = workspaceShellReducer(initialWorkspaceShellState, { type: "selectNode", nodeId: "node_1" });
    const withEvidence = workspaceShellReducer(selected, { type: "toggleEvidence" });
    expect(workspaceShellReducer(withEvidence, { type: "setDeveloperMode", enabled: false }).showEvidence).toBe(false);
  });

  it("keeps curriculum navigation in workspace mode", () => {
    const selected = workspaceShellReducer(initialWorkspaceShellState, { type: "selectNode", nodeId: "node_1" });
    expect(workspaceShellReducer(selected, { type: "setViewMode", viewMode: "curriculum" })).toMatchObject({
      viewMode: "curriculum",
      rightPanelMode: "workspace",
      showEvidence: false,
    });
  });

  it("tracks graph filters and layout resets in shell state", () => {
    const filtered = workspaceShellReducer(initialWorkspaceShellState, { type: "toggleTypeFilter", filter: "concept" });
    expect(filtered.activeTypeFilters).toEqual(["concept"]);
    const cleared = workspaceShellReducer(filtered, { type: "clearFilters" });
    expect(cleared.activeTypeFilters).toEqual([]);
    expect(workspaceShellReducer(cleared, { type: "incrementLayoutVersion" }).layoutVersion).toBe(1);
  });
});
