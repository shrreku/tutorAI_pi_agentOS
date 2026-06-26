import { useQuery } from "@tanstack/react-query";
import { fetchNotebooks, fetchStudyTemplates } from "../../routing/api.js";

function workspaceTypeLabel(workspaceType: string): string {
  switch (workspaceType) {
    case "personal_learner":
      return "Personal workspace";
    case "study_template":
      return "Study template notebook";
    default:
      return workspaceType;
  }
}

export function NotebooksListPage({ navigate }: { navigate: (path: string) => void }) {
  const {
    data: notebooks = [],
    isLoading: notebooksLoading,
    error: notebooksError,
  } = useQuery({
    queryKey: ["notebooks"],
    queryFn: fetchNotebooks,
  });

  const {
    data: templates = [],
    isLoading: templatesLoading,
    error: templatesError,
  } = useQuery({
    queryKey: ["study-templates"],
    queryFn: fetchStudyTemplates,
  });

  const personalWorkspaces = notebooks.filter((notebook) => notebook.workspaceType === "personal_learner");
  const templateNotebooks = notebooks.filter((notebook) => notebook.workspaceType === "study_template");
  const otherNotebooks = notebooks.filter(
    (notebook) => notebook.workspaceType !== "personal_learner" && notebook.workspaceType !== "study_template",
  );

  return (
    <div>
      <h1>Notebooks</h1>
      <p className="tb-lead">Open a workspace or browse published study templates.</p>

      <section className="tb-card" style={{ marginTop: 24 }}>
        <h2>Your workspaces</h2>
        {notebooksLoading && <p>Loading workspaces…</p>}
        {notebooksError && (
          <pre className="tb-error">
            {notebooksError instanceof Error ? notebooksError.message : "Failed to load workspaces"}
          </pre>
        )}
        {!notebooksLoading && !notebooksError && personalWorkspaces.length === 0 ? (
          <p>No personal workspaces yet. Start from a published template below.</p>
        ) : null}
        <ul className="tb-account-workspace-list">
          {personalWorkspaces.map((notebook) => (
            <li key={notebook.id} className="tb-account-workspace-item">
              <div>
                <strong>{notebook.title}</strong>
                <div className="tb-template-meta">
                  <span>{workspaceTypeLabel(notebook.workspaceType)}</span>
                  <span>Updated: {new Date(notebook.updatedAt).toLocaleString()}</span>
                </div>
              </div>
              <button
                type="button"
                className="tb-button tb-button-primary"
                onClick={() => navigate(`/notebooks/${encodeURIComponent(notebook.id)}`)}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="tb-card" style={{ marginTop: 24 }}>
        <h2>Template notebooks</h2>
        {notebooksLoading && <p>Loading template notebooks…</p>}
        {!notebooksLoading && templateNotebooks.length === 0 ? (
          <p>No template notebooks are available for your account.</p>
        ) : null}
        <ul className="tb-account-workspace-list">
          {templateNotebooks.map((notebook) => (
            <li key={notebook.id} className="tb-account-workspace-item">
              <div>
                <strong>{notebook.title}</strong>
                <div className="tb-template-meta">
                  <span>{workspaceTypeLabel(notebook.workspaceType)}</span>
                  <span>Updated: {new Date(notebook.updatedAt).toLocaleString()}</span>
                </div>
              </div>
              <button
                type="button"
                className="tb-button tb-button-primary"
                onClick={() => navigate(`/notebooks/${encodeURIComponent(notebook.id)}`)}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      </section>

      {otherNotebooks.length > 0 ? (
        <section className="tb-card" style={{ marginTop: 24 }}>
          <h2>Other notebooks</h2>
          <ul className="tb-account-workspace-list">
            {otherNotebooks.map((notebook) => (
              <li key={notebook.id} className="tb-account-workspace-item">
                <div>
                  <strong>{notebook.title}</strong>
                  <div className="tb-template-meta">
                    <span>{workspaceTypeLabel(notebook.workspaceType)}</span>
                    <span>Updated: {new Date(notebook.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="tb-button tb-button-primary"
                  onClick={() => navigate(`/notebooks/${encodeURIComponent(notebook.id)}`)}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="tb-card" style={{ marginTop: 24 }}>
        <h2>Published study templates</h2>
        {templatesLoading && <p>Loading templates…</p>}
        {templatesError && (
          <pre className="tb-error">
            {templatesError instanceof Error ? templatesError.message : "Failed to load templates"}
          </pre>
        )}
        {!templatesLoading && !templatesError && templates.length === 0 ? (
          <p>No published study templates yet.</p>
        ) : null}
        <div className="tb-template-grid">
          {templates.map((template) => (
            <div key={template.id} className="tb-card tb-template-card">
              <h3>{template.title}</h3>
              <div className="tb-template-meta">
                <span>Topic: {template.topic}</span>
                <span>Source level: {template.sourceLevel}</span>
                <span>Estimated time: {template.estimatedMinutes} min</span>
                <span>Study mode: {template.studyMode}</span>
              </div>
              <div className="tb-actions">
                <button
                  type="button"
                  className="tb-button"
                  onClick={() => navigate(`/app/templates/${encodeURIComponent(template.id)}`)}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="tb-button tb-button-primary"
                  onClick={() =>
                    navigate(`/app/workspaces/new?template=${encodeURIComponent(template.id)}`)
                  }
                >
                  Start studying
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
