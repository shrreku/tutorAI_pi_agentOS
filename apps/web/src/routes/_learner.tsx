import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { learnerNavActive } from "../app/learner-nav.js";
import { useAppNavigate } from "../app/navigation.js";
import { FolioLearnerShell } from "../features/folio/shell/FolioLearnerShell.js";

export const Route = createFileRoute("/_learner")({
  component: FolioLearnerLayout,
});

function FolioLearnerLayout() {
  const navigate = useAppNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <FolioLearnerShell navigate={navigate} active={learnerNavActive(pathname)}>
      <Outlet />
    </FolioLearnerShell>
  );
}
