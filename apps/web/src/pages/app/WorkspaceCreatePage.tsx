import { useEffect, useMemo, useState } from "react";
import { createWorkspaceFromTemplate } from "../../routing/api.js";

export function WorkspaceCreatePage({ navigate }: { navigate: (path: string) => void }) {
  const templateId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("template");
  }, []);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) {
      setError("No study template was selected.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const notebookId = await createWorkspaceFromTemplate(templateId);
        if (!cancelled) {
          navigate(`/notebooks/${encodeURIComponent(notebookId)}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to create workspace.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId, navigate]);

  if (error) {
    return (
      <div className="tb-card">
        <h1>Could not create workspace</h1>
        <p>{error}</p>
        <button type="button" className="tb-button" onClick={() => navigate("/app")}>
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="tb-card">
      <h1>Creating your workspace…</h1>
      <p>Setting up a personal study workspace from the template.</p>
    </div>
  );
}
