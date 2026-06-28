import { createFileRoute } from "@tanstack/react-router";
import { NotebooksPage } from "../../../../folio/pages/notebooks.js";

export const Route = createFileRoute("/_learner/app/notebooks/")({
  component: NotebooksPage,
});
