import {
  mapMeResponse,
  meApiPayloadSchema,
  meResponseSchema,
  type MeResponse,
} from "@studyagent/schemas";
import type { ApiRequestFn } from "../request.js";
import { queryKeys } from "../query-keys.js";

export type GetSessionOptions = {
  signal?: AbortSignal;
};

export async function getSession(
  request: ApiRequestFn,
  options: GetSessionOptions = {},
): Promise<MeResponse> {
  const response = await request("/me", {
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Failed to load session");
  }

  if (!response.ok) {
    if (response.status === 401) {
      return mapMeResponse({ authenticated: false });
    }
    const payload = meApiPayloadSchema.safeParse(body);
    throw new Error(payload.success ? (payload.data.message ?? "Failed to load session") : "Failed to load session");
  }

  const mapped = mapMeResponse(meApiPayloadSchema.parse(body));
  return meResponseSchema.parse(mapped);
}

export function sessionQueryKey() {
  return queryKeys.session();
}

export function sessionQueryOptions(request: ApiRequestFn) {
  return {
    queryKey: sessionQueryKey(),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getSession(request, signal !== undefined ? { signal } : {}),
  };
}
