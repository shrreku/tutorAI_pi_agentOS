import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "../app/router-context.js";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
