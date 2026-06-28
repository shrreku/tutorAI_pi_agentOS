import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_learner/app/templates/$templateId")({
  component: TemplateDetailPlaceholder,
});

function TemplateDetailPlaceholder() {
  const { templateId } = Route.useParams();
  return (
    <section>
      <h1>Template</h1>
      <div className="folio-placeholder">
        F03 template detail for <code>{templateId}</code>.
      </div>
    </section>
  );
}
