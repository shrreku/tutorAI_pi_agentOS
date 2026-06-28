export const queryKeys = {
  session: () => ["session"] as const,
  dashboard: {
    summary: () => ["dashboard", "summary"] as const,
  },
  notebooks: {
    all: () => ["notebooks"] as const,
    detail: (notebookId: string) => ["notebooks", notebookId] as const,
    workspaceBootstrap: (notebookId: string, searchKey = "") =>
      ["notebooks", notebookId, "workspace-bootstrap", searchKey] as const,
    graph: (notebookId: string, scopeKey: string) =>
      ["notebook-graph", notebookId, scopeKey] as const,
    sources: (notebookId: string) => ["notebook-sources", notebookId] as const,
    referenceSurface: (notebookId: string, nodeId: string) =>
      ["reference-surface", notebookId, nodeId] as const,
    nodeEvidence: (notebookId: string, nodeId: string) =>
      ["node-evidence", notebookId, nodeId] as const,
    tutorTrace: (notebookId: string, sessionKey: string) =>
      ["tutor-trace", notebookId, sessionKey] as const,
  },
} as const;
