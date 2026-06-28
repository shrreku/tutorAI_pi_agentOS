import { matchRoute, routeTelemetryName } from "./routes.js";

export function routeTelemetryFromPath(pathname: string): string {
  return routeTelemetryName(matchRoute(pathname));
}
