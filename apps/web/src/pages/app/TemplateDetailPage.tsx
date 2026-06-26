import { useQuery } from "@tanstack/react-query";
import { fetchStudyTemplate } from "../../routing/api.js";

export function TemplateDetailPage({
  templateId,
  navigate,
}: {
  templateId: string;
  navigate: (path: string) => void;
}) {
  const {
    data: template,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["study-template", templateId],
    queryFn: () => fetchStudyTemplate(templateId),
  });

  if (isLoading) {
    return <div className="tb-card">Loading template…</div>;
  }

  if (error || !template) {
    return (
      <div className="tb-card">
        <h1>Template unavailable</h1>
        <p>{error instanceof Error ? error.message : "This template could not be loaded."}</p>
        <button type="button" className="tb-button" onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="tb-card">
      <button type="button" className="tb-button" onClick={() => navigate("/app")}>
        ← Back
      </button>
      <h1 style={{ marginTop: 16 }}>{template.title}</h1>
      <div className="tb-template-meta" style={{ marginTop: 12 }}>
        <span>Topic: {template.topic}</span>
        <span>Source level: {template.sourceLevel}</span>
        <span>Estimated time: {template.estimatedMinutes} minutes</span>
        <span>Study mode: {template.studyMode}</span>
        <span>Expected outcome: {template.expectedOutcome}</span>
      </div>
      <div className="tb-actions">
        <button
          type="button"
          className="tb-button tb-button-primary"
          onClick={() => navigate(`/app/workspaces/new?template=${encodeURIComponent(templateId)}`)}
        >
          Start studying
        </button>
      </div>
    </div>
  );
}
