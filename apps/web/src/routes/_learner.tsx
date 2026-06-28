import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { sessionQueryOptions } from "@studyagent/api-client";
import { LearnerShell } from "../components/chrome/learner-shell.js";
import type { RouterContext } from "../app/router-context.js";

export const Route = createFileRoute("/_learner")({
  beforeLoad: async ({ context, location }) => {
    const ctx = context as RouterContext;
    const session = await ctx.queryClient.ensureQueryData(
      sessionQueryOptions(ctx.api.request),
    );

    if (!session.authenticated) {
      throw redirect({ to: "/login" });
    }

    if (session.disabled) {
      throw redirect({ to: "/login", search: { error: "disabled" } });
    }

    const isConsentRoute = location.pathname === "/app/consent";
    if (!session.consentAccepted && !isConsentRoute) {
      throw redirect({ to: "/app/consent" });
    }

    return { session };
  },
  component: LearnerLayout,
});

function LearnerLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isConsent = pathname === "/app/consent";

  if (isConsent) {
    return <Outlet />;
  }

  return (
    <LearnerShell>
      <Outlet />
    </LearnerShell>
  );
}
