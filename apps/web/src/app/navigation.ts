import { useCallback } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

/** Bridge legacy `navigate("/path?query")` call sites to TanStack Router. */
export function useAppNavigate(): (path: string) => void {
  const router = useRouter();
  const navigate = useNavigate();

  return useCallback(
    (path: string) => {
      const url = new URL(path, window.location.origin);
      const searchParams = Object.fromEntries(url.searchParams.entries());
      void navigate({
        to: url.pathname,
        ...(Object.keys(searchParams).length > 0 ? { search: searchParams } : {}),
        replace: false,
      }).catch(() => {
        router.history.push(`${url.pathname}${url.search}`);
      });
    },
    [navigate, router],
  );
}
