import type { GraphQueryResponse, SourceLearnerView } from "@studyagent/schemas";

const api = (path: string, init?: RequestInit) => fetch(`/api/v1${path}`, init);

export function notebookSourcesQueryKey(notebookId: string | null | undefined) {
  return ["notebook-sources", notebookId] as const;
}

export async function fetchNotebookSources(notebookId: string | null | undefined): Promise<SourceLearnerView[]> {
  if (!notebookId) return [];
  const res = await api(`/notebooks/${encodeURIComponent(notebookId)}/sources`);
  if (!res.ok) {
    throw new Error(`Failed to load sources (${res.status})`);
  }
  const data = (await res.json()) as { sources: SourceLearnerView[] };
  return data.sources ?? [];
}

export function notebookStudyStateQueryKey(notebookId: string | null | undefined) {
  return ["notebook-study-state", notebookId] as const;
}

export async function fetchNotebookStudyState<T = unknown>(notebookId: string): Promise<T> {
  const res = await api(`/notebooks/${encodeURIComponent(notebookId)}/study-state`);
  if (!res.ok) {
    throw new Error(`Failed to load study state (${res.status})`);
  }
  return (await res.json()) as T;
}

export function notebookGraphQueryKey(
  notebookId: string,
  viewMode: string,
  sourceScope: string,
  isDeveloperMode: boolean,
  refreshToken: number,
) {
  return ["notebook-graph", notebookId, viewMode, sourceScope, isDeveloperMode, refreshToken] as const;
}

export async function fetchNotebookGraphQuery(input: {
  notebookId: string;
  body: Record<string, unknown>;
}): Promise<GraphQueryResponse> {
  const res = await api(`/notebooks/${encodeURIComponent(input.notebookId)}/graph/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  });
  if (!res.ok) {
    throw new Error(`Failed to load graph (${res.status})`);
  }
  return (await res.json()) as GraphQueryResponse;
}

export function curriculumOutlineQueryKey(notebookId: string, refreshToken: number) {
  return ["curriculum-outline", notebookId, refreshToken] as const;
}

export async function fetchCurriculumOutline<T = unknown>(notebookId: string): Promise<T> {
  const res = await api(`/notebooks/${encodeURIComponent(notebookId)}/curriculum-outline`);
  if (!res.ok) {
    throw new Error(`Failed to load curriculum outline (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchNotebookArtifacts(notebookId: string): Promise<unknown[]> {
  const res = await api(`/notebooks/${encodeURIComponent(notebookId)}/artifacts`);
  if (!res.ok) {
    throw new Error(`Failed to load artifacts (${res.status})`);
  }
  const data = (await res.json()) as { artifacts?: unknown[] };
  return data.artifacts ?? [];
}

export async function saveGraphNodeLayout(input: {
  notebookId: string;
  nodeId: string;
  position: { x: number; y: number };
  nodeType: string;
  refType: string;
}): Promise<void> {
  const res = await api(
    `/notebooks/${encodeURIComponent(input.notebookId)}/graph/layout/${encodeURIComponent(input.nodeId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        position: input.position,
        nodeType: input.nodeType,
        refType: input.refType,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to save layout (${res.status})`);
  }
}

export async function clearGraphLayout(notebookId: string): Promise<void> {
  const res = await api(`/notebooks/${encodeURIComponent(notebookId)}/graph/layout`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Failed to clear layout (${res.status})`);
  }
}
