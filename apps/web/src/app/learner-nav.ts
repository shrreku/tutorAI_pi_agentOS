export type FolioNavKey =
  | "dashboard"
  | "notebooks"
  | "credits"
  | "access-code"
  | "support"
  | "account";

export function learnerNavActive(pathname: string): FolioNavKey {
  if (pathname.startsWith("/app/credits")) return "credits";
  if (pathname.startsWith("/app/access-code")) return "access-code";
  if (pathname.startsWith("/app/support")) return "support";
  if (pathname.startsWith("/app/account")) return "account";
  if (pathname === "/notebooks" || pathname.startsWith("/notebooks/")) return "notebooks";
  return "dashboard";
}
