import { createRouter } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen.js";
import { folioQueryClient } from "./query-client.js";

export type RouterContext = {
  queryClient: typeof folioQueryClient;
};

export const router = createRouter({
  routeTree,
  context: {
    queryClient: folioQueryClient,
  },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 30_000,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
