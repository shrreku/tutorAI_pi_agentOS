import { createFileRoute } from "@tanstack/react-router";
import { TemplateDetailPage } from "../../../../folio/pages/learner-misc.js";

export const Route = createFileRoute("/_learner/app/templates/$templateId")({
  component: TemplateDetailRoute,
});

function TemplateDetailRoute() {
  const { templateId } = Route.useParams();
  return <TemplateDetailPage templateId={templateId} />;
}
