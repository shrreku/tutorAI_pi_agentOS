import {
  notebookSourcesResponseSchema,
  sourceLearnerViewSchema,
  type SourceLearnerView,
} from "@studyagent/schemas";
import { z } from "zod";
import type { ApiRequestFn } from "../request.js";
import { requestJson } from "../request.js";
import { queryKeys } from "../query-keys.js";

const sourceUploadResponseSchema = z.object({
  source: sourceLearnerViewSchema,
});

const retryIngestionResponseSchema = z.object({
  ok: z.boolean().optional(),
  sourceId: z.string().optional(),
}).passthrough();

export type ListNotebookSourcesOptions = {
  signal?: AbortSignal;
};

export async function listNotebookSources(
  request: ApiRequestFn,
  notebookId: string,
  options: ListNotebookSourcesOptions = {},
): Promise<SourceLearnerView[]> {
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/sources`,
    schema: notebookSourcesResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data.sources;
}

export function notebookSourcesQueryKey(notebookId: string) {
  return queryKeys.notebooks.sources(notebookId);
}

export function notebookSourcesQueryOptions(request: ApiRequestFn, notebookId: string) {
  return {
    queryKey: notebookSourcesQueryKey(notebookId),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      listNotebookSources(request, notebookId, signal !== undefined ? { signal } : {}),
  };
}

export type UploadNotebookSourceOptions = {
  signal?: AbortSignal;
};

export async function uploadNotebookSource(
  request: ApiRequestFn,
  notebookId: string,
  file: File,
  options: UploadNotebookSourceOptions = {},
): Promise<SourceLearnerView> {
  const formData = new FormData();
  formData.append("file", file);
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/sources`,
    init: { method: "POST", body: formData },
    schema: sourceUploadResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data.source;
}

export type RetrySourceIngestionOptions = {
  signal?: AbortSignal;
};

export async function retrySourceIngestion(
  request: ApiRequestFn,
  sourceId: string,
  options: RetrySourceIngestionOptions = {},
): Promise<void> {
  await requestJson(request, {
    path: `/sources/${encodeURIComponent(sourceId)}/retry-ingestion`,
    init: { method: "POST" },
    schema: retryIngestionResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
}
