import type { z } from "zod";
import { ApiError } from "./errors.js";

export type ApiRequestFn = (path: string, init?: RequestInit) => Promise<Response>;

export type RequestJsonOptions<T> = {
  path: string;
  init?: RequestInit;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
};

export type RequestJsonResult<T> = {
  data: T;
  requestId?: string;
  traceId?: string;
};

const REQUEST_ID_HEADERS = ["x-request-id", "x-studyagent-request-id"] as const;
const TRACE_ID_HEADERS = ["x-trace-id", "x-studyagent-trace-id"] as const;

export async function requestJson<T>(
  request: ApiRequestFn,
  options: RequestJsonOptions<T>,
): Promise<RequestJsonResult<T>> {
  const { path, init, schema, signal } = options;
  const response = await request(path, {
    ...init,
    ...(signal !== undefined ? { signal } : {}),
  });

  const requestId = readCorrelationHeader(response, REQUEST_ID_HEADERS);
  const traceId = readCorrelationHeader(response, TRACE_ID_HEADERS);
  const correlation = {
    ...(requestId !== undefined ? { requestId } : {}),
    ...(traceId !== undefined ? { traceId } : {}),
  };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError({
        status: response.status,
        code: "invalid_response",
        message: `Request failed with status ${response.status}`,
        ...correlation,
        retryable: response.status >= 500,
      });
    }
    throw new ApiError({
      status: response.status,
      code: "invalid_response",
      message: "Response body was not valid JSON",
      ...correlation,
      retryable: false,
    });
  }

  if (!response.ok) {
    throw ApiError.fromResponse(response.status, body, correlation);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: response.status,
      code: "invalid_response",
      message: "Response did not match the expected schema",
      ...correlation,
      retryable: false,
      details: { issues: parsed.error.issues },
    });
  }

  return {
    data: parsed.data,
    ...correlation,
  };
}

export function readCorrelationHeader(
  response: Response,
  headerNames: readonly string[],
): string | undefined {
  for (const headerName of headerNames) {
    const value = response.headers.get(headerName);
    if (value) return value;
  }
  return undefined;
}
