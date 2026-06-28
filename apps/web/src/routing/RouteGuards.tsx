import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { identifyPostHogUser, initPostHog } from "../analytics/posthog.js";
import { api, fetchMe, fetchReplayPolicy, rootApi, type MeResponse } from "./api.js";
import {
  isAdminRoute,
  isEvalRunsRoute,
  isProtectedRoute,
  matchRoute,
  requiresConsent,
} from "./routes.js";

type NavigateFn = (path: string) => void;

const SessionContext = createContext<{
  session: MeResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    retry: false,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    await refetch();
  }, [queryClient, refetch]);

  const value = useMemo(
    () => ({
      session: data ?? null,
      isLoading,
      error: error instanceof Error ? error.message : null,
      refresh,
    }),
    [data, isLoading, error, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function GuardLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="text-[13px] text-muted-foreground">Loading session…</p>
      </div>
    </div>
  );
}

function GuardMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
        <h1 className="font-display text-[22px] font-semibold">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function RouteGuard({
  routePath,
  navigate,
  children,
}: {
  routePath: string;
  navigate: NavigateFn;
  children: ReactNode;
}) {
  const match = useMemo(() => matchRoute(routePath), [routePath]);
  const { session, isLoading, error } = useSession();

  useEffect(() => {
    if (isLoading || !isProtectedRoute(match)) return;

    if (!session?.authenticated) {
      navigate("/login");
      return;
    }

    if (session.disabled) {
      return;
    }

    if (session.consentAccepted) {
      void fetchReplayPolicy()
        .then(async (policy) => {
          await initPostHog(policy);
          if (session.user) {
            identifyPostHogUser(session.user.id, {
              email: session.user.email,
              ...(session.user.displayName ? { name: session.user.displayName } : {}),
            });
          }
        })
        .catch(() => undefined);
    }

    if (isEvalRunsRoute(match)) {
      if (!session.entitlements.adminAccess) {
        navigate("/app");
      }
      return;
    }

    if (isAdminRoute(match)) {
      if (!session.entitlements.adminAccess) {
        navigate("/app");
      }
      return;
    }

    if (!session.entitlements.studyAccess) {
      navigate("/login");
      return;
    }

    if (requiresConsent(match) && !session.consentAccepted) {
      navigate("/app/consent");
    }
  }, [isLoading, match, navigate, session]);

  if (!isProtectedRoute(match)) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <GuardLoading />;
  }

  if (error) {
    return <GuardMessage title="Session unavailable" message={error} />;
  }

  if (!session?.authenticated) {
    return <GuardLoading />;
  }

  if (session.disabled) {
    return (
      <GuardMessage
        title="Account disabled"
        message="Your account has been disabled. Contact support if you believe this is a mistake."
      />
    );
  }

  if (isEvalRunsRoute(match) && !session.entitlements.adminAccess) {
    return <GuardLoading />;
  }

  if (isAdminRoute(match) && !session.entitlements.adminAccess) {
    return <GuardLoading />;
  }

  if (!isAdminRoute(match) && !isEvalRunsRoute(match) && !session.entitlements.studyAccess) {
    return <GuardLoading />;
  }

  if (requiresConsent(match) && !session.consentAccepted) {
    return <GuardLoading />;
  }

  return <>{children}</>;
}

export async function submitConsent(_consentVersion?: string): Promise<void> {
  const res = await api("/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
}

export async function devLogin(email: string): Promise<void> {
  const res = await rootApi("/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = (await res.json()) as { actor: { id: string } };
  window.localStorage.setItem("tutorbook.devUserId", data.actor.id);
}

export function isLocalhost(): boolean {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}
