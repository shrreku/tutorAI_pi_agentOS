import * as dashboard from "./operations/dashboard.js";
import * as notebooks from "./operations/notebooks.js";
import * as session from "./operations/session.js";
import * as sources from "./operations/sources.js";
import * as tutor from "./operations/tutor.js";
import type { ApiRequestFn } from "./request.js";

export type CreateApiClientOptions = {
  baseUrl?: string;
};

const DEV_USER_ID_STORAGE_KEY = "tutorbook.devUserId";

export function createApiClient(options: CreateApiClientOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? "/api/v1");
  const request = createRequestFn(baseUrl);

  return {
    request,
    getSession: (opts?: session.GetSessionOptions) => session.getSession(request, opts),
    getDashboardSummary: (opts?: dashboard.GetDashboardSummaryOptions) =>
      dashboard.getDashboardSummary(request, opts),
    listNotebooks: (opts?: notebooks.RequestOptions) => notebooks.listNotebooks(request, opts),
    getNotebook: (notebookId: string, opts?: notebooks.RequestOptions) =>
      notebooks.getNotebook(request, notebookId, opts),
    getWorkspaceBootstrap: (notebookId: string, opts?: notebooks.RequestOptions) =>
      notebooks.getWorkspaceBootstrap(request, notebookId, opts),
    queryNotebookGraph: (
      notebookId: string,
      body: Parameters<typeof notebooks.queryNotebookGraph>[2],
      opts?: notebooks.RequestOptions,
    ) => notebooks.queryNotebookGraph(request, notebookId, body, opts),
    getNodeEvidence: (
      notebookId: string,
      nodeId: string,
      opts?: notebooks.RequestOptions & { devMode?: boolean },
    ) => notebooks.getNodeEvidence(request, notebookId, nodeId, opts),
    getNodeReferenceSurface: (
      notebookId: string,
      nodeId: string,
      opts?: notebooks.RequestOptions,
    ) => notebooks.getNodeReferenceSurface(request, notebookId, nodeId, opts),
    listNotebookSources: (notebookId: string, opts?: sources.ListNotebookSourcesOptions) =>
      sources.listNotebookSources(request, notebookId, opts),
    uploadNotebookSource: (
      notebookId: string,
      file: File,
      opts?: sources.UploadNotebookSourceOptions,
    ) => sources.uploadNotebookSource(request, notebookId, file, opts),
    retrySourceIngestion: (sourceId: string, opts?: sources.RetrySourceIngestionOptions) =>
      sources.retrySourceIngestion(request, sourceId, opts),
    getTutorTrace: (notebookId: string, opts?: tutor.GetTutorTraceOptions) =>
      tutor.getTutorTrace(request, notebookId, opts),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export function createRequestFn(baseUrl: string): ApiRequestFn {
  return async (path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const devUserId = readDevUserId();
    if (devUserId) {
      headers.set("X-User-Id", devUserId);
    }

    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function readDevUserId(): string | null {
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      return globalThis.localStorage.getItem(DEV_USER_ID_STORAGE_KEY);
    }
  } catch {
    return null;
  }
  return null;
}

export { dashboard, notebooks, session, sources, tutor };
