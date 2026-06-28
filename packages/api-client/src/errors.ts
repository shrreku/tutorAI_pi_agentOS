import { apiErrorSchema, type ApiError as ApiErrorPayload } from "@studyagent/schemas";

export type ApiErrorFieldErrors = Record<string, string[]>;

export type ApiErrorInit = {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  traceId?: string;
  fieldErrors?: ApiErrorFieldErrors;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly fieldErrors?: ApiErrorFieldErrors;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    if (init.requestId !== undefined) this.requestId = init.requestId;
    if (init.traceId !== undefined) this.traceId = init.traceId;
    if (init.fieldErrors !== undefined) this.fieldErrors = init.fieldErrors;
    this.retryable = init.retryable ?? false;
    if (init.details !== undefined) this.details = init.details;
  }

  static fromResponse(
    status: number,
    body: unknown,
    correlation?: { requestId?: string; traceId?: string },
  ): ApiError {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      return ApiError.fromPayload(status, parsed.data, correlation);
    }

    const record = isRecord(body) ? body : {};
    const message =
      typeof record.message === "string" && record.message.trim()
        ? record.message
        : `Request failed with status ${status}`;
    const code = typeof record.code === "string" && record.code.trim() ? record.code : "request_failed";

    const fieldErrors = extractFieldErrors(record);
    return new ApiError({
      status,
      code,
      message,
      ...(correlation?.requestId !== undefined ? { requestId: correlation.requestId } : {}),
      ...(correlation?.traceId !== undefined ? { traceId: correlation.traceId } : {}),
      ...(fieldErrors !== undefined ? { fieldErrors } : {}),
      retryable: typeof record.retryable === "boolean" ? record.retryable : status >= 500,
      ...(isRecord(record.details) ? { details: record.details } : {}),
    });
  }

  static fromPayload(
    status: number,
    payload: ApiErrorPayload,
    correlation?: { requestId?: string; traceId?: string },
  ): ApiError {
    const fieldErrors = extractFieldErrors(payload.details);
    return new ApiError({
      status,
      code: payload.code,
      message: payload.message,
      ...(correlation?.requestId !== undefined ? { requestId: correlation.requestId } : {}),
      ...(correlation?.traceId !== undefined
        ? { traceId: correlation.traceId }
        : payload.traceId !== undefined
          ? { traceId: payload.traceId }
          : {}),
      retryable: payload.retryable,
      ...(payload.details !== undefined ? { details: payload.details } : {}),
      ...(fieldErrors !== undefined ? { fieldErrors } : {}),
    });
  }
}

function extractFieldErrors(details: unknown): ApiErrorFieldErrors | undefined {
  if (!isRecord(details)) return undefined;
  const raw = details.fieldErrors ?? details.fields;
  if (!isRecord(raw)) return undefined;

  const fieldErrors: ApiErrorFieldErrors = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      fieldErrors[key] = [value];
      continue;
    }
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
      fieldErrors[key] = value;
    }
  }

  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
