import {
  evidenceReadModelSchema,
  graphQueryResponseSchema,
  notebookDetailResponseSchema,
  notebookRecordSchema,
  notebooksListResponseSchema,
  notebookWorkspaceBootstrapSchema,
  referenceSurfaceSchema,
  type EvidenceReadModel,
  type GraphQueryBody,
  type GraphQueryResponse,
  type NotebookRecord,
  type NotebookWorkspaceBootstrap,
  type ReferenceSurface,
} from "@studyagent/schemas";
import type { ApiRequestFn } from "../request.js";
import { requestJson } from "../request.js";
import { queryKeys } from "../query-keys.js";

export type RequestOptions = {
  signal?: AbortSignal;
};

export async function listNotebooks(
  request: ApiRequestFn,
  options: RequestOptions = {},
): Promise<NotebookRecord[]> {
  const result = await requestJson(request, {
    path: "/notebooks",
    schema: notebooksListResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data.notebooks;
}

export async function getNotebook(
  request: ApiRequestFn,
  notebookId: string,
  options: RequestOptions = {},
): Promise<NotebookRecord> {
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}`,
    schema: notebookDetailResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return notebookRecordSchema.parse(result.data.notebook);
}

export type WorkspaceBootstrapOptions = RequestOptions & {
  search?: Record<string, string | string[] | undefined>;
};

export async function getWorkspaceBootstrap(
  request: ApiRequestFn,
  notebookId: string,
  options: WorkspaceBootstrapOptions = {},
): Promise<NotebookWorkspaceBootstrap> {
  const query = serializeWorkspaceSearch(options.search);
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/workspace${query}`,
    schema: notebookWorkspaceBootstrapSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data;
}

export async function queryNotebookGraph(
  request: ApiRequestFn,
  notebookId: string,
  body: GraphQueryBody,
  options: RequestOptions = {},
): Promise<GraphQueryResponse> {
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/graph/query`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    schema: graphQueryResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data;
}

export async function getNodeEvidence(
  request: ApiRequestFn,
  notebookId: string,
  nodeId: string,
  options: RequestOptions & { devMode?: boolean } = {},
): Promise<EvidenceReadModel> {
  const search = options.devMode ? "?devMode=true" : "";
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/nodes/${encodeURIComponent(nodeId)}/provenance${search}`,
    schema: evidenceReadModelSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data;
}

export async function getNodeReferenceSurface(
  request: ApiRequestFn,
  notebookId: string,
  nodeId: string,
  options: RequestOptions = {},
): Promise<ReferenceSurface> {
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/nodes/${encodeURIComponent(nodeId)}/reference-surface`,
    schema: referenceSurfaceSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data;
}

export function notebooksQueryKey() {
  return queryKeys.notebooks.all();
}

export function notebookQueryKey(notebookId: string) {
  return queryKeys.notebooks.detail(notebookId);
}

export function workspaceBootstrapQueryKey(
  notebookId: string,
  searchKey = "",
) {
  return queryKeys.notebooks.workspaceBootstrap(notebookId, searchKey);
}

export function notebookGraphQueryKey(notebookId: string, body: GraphQueryBody) {
  return queryKeys.notebooks.graph(notebookId, graphQueryScopeKey(body));
}

export function nodeEvidenceQueryKey(notebookId: string, nodeId: string) {
  return queryKeys.notebooks.nodeEvidence(notebookId, nodeId);
}

export function referenceSurfaceQueryKey(notebookId: string, nodeId: string) {
  return queryKeys.notebooks.referenceSurface(notebookId, nodeId);
}

export function notebooksQueryOptions(request: ApiRequestFn) {
  return {
    queryKey: notebooksQueryKey(),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      listNotebooks(request, signal !== undefined ? { signal } : {}),
  };
}

export function notebookQueryOptions(request: ApiRequestFn, notebookId: string) {
  return {
    queryKey: notebookQueryKey(notebookId),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getNotebook(request, notebookId, signal !== undefined ? { signal } : {}),
  };
}

export function workspaceBootstrapQueryOptions(
  request: ApiRequestFn,
  notebookId: string,
  search?: Record<string, string | string[] | undefined>,
) {
  const searchKey = search ? stableSearchKey(search) : "";
  return {
    queryKey: workspaceBootstrapQueryKey(notebookId, searchKey),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getWorkspaceBootstrap(request, notebookId, {
        ...(search ? { search } : {}),
        ...(signal !== undefined ? { signal } : {}),
      }),
  };
}

export function notebookGraphQueryOptions(
  request: ApiRequestFn,
  notebookId: string,
  body: GraphQueryBody,
) {
  return {
    queryKey: notebookGraphQueryKey(notebookId, body),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      queryNotebookGraph(request, notebookId, body, signal !== undefined ? { signal } : {}),
  };
}

export function nodeEvidenceQueryOptions(
  request: ApiRequestFn,
  notebookId: string,
  nodeId: string,
  options: { devMode?: boolean } = {},
) {
  return {
    queryKey: nodeEvidenceQueryKey(notebookId, nodeId),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getNodeEvidence(request, notebookId, nodeId, {
        ...options,
        ...(signal !== undefined ? { signal } : {}),
      }),
  };
}

export function referenceSurfaceQueryOptions(
  request: ApiRequestFn,
  notebookId: string,
  nodeId: string,
) {
  return {
    queryKey: referenceSurfaceQueryKey(notebookId, nodeId),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getNodeReferenceSurface(request, notebookId, nodeId, signal !== undefined ? { signal } : {}),
  };
}

function graphQueryScopeKey(body: GraphQueryBody): string {
  const entries = Object.entries(body).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}

function serializeWorkspaceSearch(
  search?: Record<string, string | string[] | undefined>,
): string {
  if (!search) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value[0]) params.set(key, value[0]);
    } else {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function stableSearchKey(search: Record<string, string | string[] | undefined>): string {
  const entries = Object.entries(search)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, Array.isArray(value) ? (value[0] ?? "") : value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}
