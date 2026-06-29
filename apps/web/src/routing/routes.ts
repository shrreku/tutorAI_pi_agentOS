export type RouteMatch = {
  path: string;
};

export function matchRoute(path: string): RouteMatch {
  return { path };
}

export function isProtectedRoute(_match: RouteMatch): boolean {
  return false;
}

export function isAdminRoute(_match: RouteMatch): boolean {
  return false;
}

export function isEvalRunsRoute(_match: RouteMatch): boolean {
  return false;
}

export function requiresConsent(_match: RouteMatch): boolean {
  return false;
}
