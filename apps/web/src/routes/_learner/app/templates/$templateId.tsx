import { createFileRoute } from "@tanstack/react-router";
import { useAppNavigate } from "../../../../app/navigation.js";
import { TemplateDetailPage } from "../../../../pages/app/TemplateDetailPage.js";

export const Route = createFileRoute("/_learner/app/templates/$templateId")({
  component: TemplateDetailRoute,
});

function TemplateDetailRoute() {
  const navigate = useAppNavigate();
  const { templateId } = Route.useParams();
  return <TemplateDetailPage templateId={templateId} navigate={navigate} />;
}
