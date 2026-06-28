import {
  learnerDashboardSummarySchema,
  type LearnerDashboardSummary,
} from "@studyagent/schemas";
import type { ApiRequestFn } from "../request.js";
import { requestJson } from "../request.js";
import { queryKeys } from "../query-keys.js";

export type GetDashboardSummaryOptions = {
  signal?: AbortSignal;
};

export async function getDashboardSummary(
  request: ApiRequestFn,
  options: GetDashboardSummaryOptions = {},
): Promise<LearnerDashboardSummary> {
  const result = await requestJson(request, {
    path: "/dashboard",
    schema: learnerDashboardSummarySchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data;
}

export function dashboardSummaryQueryKey() {
  return queryKeys.dashboard.summary();
}

export function dashboardSummaryQueryOptions(request: ApiRequestFn) {
  return {
    queryKey: dashboardSummaryQueryKey(),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getDashboardSummary(request, signal !== undefined ? { signal } : {}),
  };
}
