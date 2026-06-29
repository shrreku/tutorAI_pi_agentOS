import * as dashboard from "./operations/dashboard.js";
import * as notebooks from "./operations/notebooks.js";
import * as session from "./operations/session.js";
import * as sources from "./operations/sources.js";
import * as tutor from "./operations/tutor.js";
import * as product from "./operations/product.js";
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
    listStudyTemplates: (opts?: product.ProductRequestOptions) =>
      product.listStudyTemplates(request, opts),
    getStudyTemplate: (templateId: string, opts?: product.ProductRequestOptions) =>
      product.getStudyTemplate(request, templateId, opts),
    createWorkspaceFromTemplate: (templateId: string, opts?: product.ProductRequestOptions) =>
      product.createWorkspaceFromTemplate(request, templateId, opts),
    createNotebook: (title: string, opts?: product.ProductRequestOptions) =>
      product.createNotebook(request, title, opts),
    submitConsent: (opts?: product.ProductRequestOptions) => product.submitConsent(request, opts),
    redeemAccessCode: (code: string, opts?: product.ProductRequestOptions) =>
      product.redeemAccessCode(request, code, opts),
    submitLearningFeedback: (
      body: Parameters<typeof product.submitLearningFeedback>[1],
      opts?: product.ProductRequestOptions,
    ) => product.submitLearningFeedback(request, body, opts),
    submitAccountDeletionRequest: (notes: string, opts?: product.ProductRequestOptions) =>
      product.submitAccountDeletionRequest(request, notes, opts),
    listCreditCheckoutPacks: (opts?: product.ProductRequestOptions) =>
      product.listCreditCheckoutPacks(request, opts),
    startCreditCheckout: (packId: string, opts?: product.ProductRequestOptions) =>
      product.startCreditCheckout(request, packId, opts),
    getNotebookStudyState: <T = Record<string, unknown>>(
      notebookId: string,
      opts?: product.ProductRequestOptions,
    ) => product.getNotebookStudyState<T>(request, notebookId, opts),
    listNotebookArtifacts: (notebookId: string, opts?: product.ProductRequestOptions) =>
      product.listNotebookArtifacts(request, notebookId, opts),
    getGraphLayout: (notebookId: string, opts?: product.ProductRequestOptions) =>
      product.getGraphLayout(request, notebookId, opts),
    saveGraphNodeLayout: (
      notebookId: string,
      nodeId: string,
      input: Parameters<typeof product.saveGraphNodeLayout>[3],
      opts?: product.ProductRequestOptions,
    ) => product.saveGraphNodeLayout(request, notebookId, nodeId, input, opts),
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

export { dashboard, notebooks, product, session, sources, tutor };
