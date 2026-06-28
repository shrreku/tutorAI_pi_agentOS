import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../../app/navigation.js";
import { NotebooksListPage } from "../../../pages/app/NotebooksListPage.js";

export const Route = createFileRoute("/_learner/notebooks/")({
  component: NotebooksListRoute,
});

function NotebooksListRoute() {
  const navigate = useAppNavigate();
  return <NotebooksListPage navigate={navigate} />;
}
