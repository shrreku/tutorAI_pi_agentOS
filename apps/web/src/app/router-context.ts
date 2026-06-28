import { QueryClient } from "@tanstack/react-query";
import { createApiClient, type ApiClient } from "@studyagent/api-client";

export type RouterContext = {
  queryClient: QueryClient;
  api: ApiClient;
};

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  });
}

export function createAppRouterContext(queryClient: QueryClient): RouterContext {
  return {
    queryClient,
    api: createApiClient(),
  };
}
