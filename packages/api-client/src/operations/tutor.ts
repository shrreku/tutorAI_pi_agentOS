import { chatTraceResponseSchema, type ChatTraceResponse } from "@studyagent/schemas";
import type { ApiRequestFn } from "../request.js";
import { requestJson } from "../request.js";
import { queryKeys } from "../query-keys.js";

export type GetTutorTraceOptions = {
  signal?: AbortSignal;
  sessionId?: string;
  limit?: number;
};

export async function getTutorTrace(
  request: ApiRequestFn,
  notebookId: string,
  options: GetTutorTraceOptions = {},
): Promise<ChatTraceResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 80));
  if (options.sessionId) {
    params.set("sessionId", options.sessionId);
  }
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/tutor/trace?${params.toString()}`,
    schema: chatTraceResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data;
}

export function tutorTraceQueryKey(notebookId: string, sessionId?: string) {
  return queryKeys.notebooks.tutorTrace(notebookId, sessionId ?? "");
}

export function tutorTraceQueryOptions(
  request: ApiRequestFn,
  notebookId: string,
  options: { sessionId?: string; limit?: number } = {},
) {
  return {
    queryKey: tutorTraceQueryKey(notebookId, options.sessionId),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getTutorTrace(request, notebookId, {
        ...options,
        ...(signal !== undefined ? { signal } : {}),
      }),
  };
}
