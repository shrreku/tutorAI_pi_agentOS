import { RouterProvider } from "@tanstack/react-router";
import { router } from "./app/router.js";
import { folioQueryClient } from "./app/query-client.js";

export function App() {
  return <RouterProvider router={router} context={{ queryClient: folioQueryClient }} />;
}
