export type WorkspacePane = "tutor" | "graph";

export const defaultWorkspaceLayout = {
  leftPane: "tutor" satisfies WorkspacePane,
  rightPane: "graph" satisfies WorkspacePane,
  splitPercent: 38,
};
