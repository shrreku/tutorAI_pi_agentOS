import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  deleteSource,
  deleteWorkspace,
  fetchAccountSources,
  fetchNotebooks,
  submitAccountDeletionRequest,
  type NotebookSummary,
} from "../../routing/api.js";

export function AccountPage() {
  const queryClient = useQueryClient();
  const [deletionNotes, setDeletionNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: workspaces = [], isLoading, error } = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: fetchNotebooks,
  });

  const { data: sources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ["account-sources"],
    queryFn: fetchAccountSources,
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: deleteWorkspace,
    onSuccess: async () => {
      setStatusMessage("Workspace deleted.");
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["account-workspaces"] });
      await queryClient.invalidateQueries({ queryKey: ["account-sources"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete workspace");
      setStatusMessage(null);
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: deleteSource,
    onSuccess: async () => {
      setStatusMessage("Source deleted.");
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["account-sources"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete source");
      setStatusMessage(null);
    },
  });

  const deletionRequestMutation = useMutation({
    mutationFn: () => submitAccountDeletionRequest(deletionNotes),
    onSuccess: () => {
      setStatusMessage("Account deletion request submitted. Our team will follow up by email.");
      setErrorMessage(null);
      setDeletionNotes("");
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit deletion request");
      setStatusMessage(null);
    },
  });

  return (
    <div>
      <h1>Account &amp; data</h1>
      <p className="tb-lead">Delete personal workspaces, uploaded sources, or request full account deletion.</p>

      {isLoading && <div className="tb-card">Loading workspaces…</div>}
      {error && <pre className="tb-error">{error instanceof Error ? error.message : "Failed to load workspaces"}</pre>}
      {statusMessage && <div className="tb-card">{statusMessage}</div>}
      {errorMessage && <pre className="tb-error">{errorMessage}</pre>}

      <section className="tb-card">
        <h2>Your workspaces</h2>
        {workspaces.length === 0 && !isLoading ? <p>You do not have any workspaces yet.</p> : null}
        <ul className="tb-account-workspace-list">
          {workspaces.map((workspace: NotebookSummary) => (
            <li key={workspace.id} className="tb-account-workspace-item">
              <div>
                <strong>{workspace.title}</strong>
                <div className="tb-template-meta">
                  <span>Type: {workspace.workspaceType}</span>
                  <span>Updated: {new Date(workspace.updatedAt).toLocaleString()}</span>
                </div>
              </div>
              {workspace.workspaceType === "personal_learner" ? (
                <button
                  type="button"
                  className="tb-button"
                  disabled={deleteWorkspaceMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete workspace "${workspace.title}"? This cannot be undone.`)) {
                      deleteWorkspaceMutation.mutate(workspace.id);
                    }
                  }}
                >
                  Delete workspace
                </button>
              ) : (
                <span className="tb-muted">Managed workspace</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="tb-card">
        <h2>Uploaded sources</h2>
        {sourcesLoading && <p>Loading sources…</p>}
        {!sourcesLoading && sources.length === 0 ? <p>No uploaded sources in personal workspaces.</p> : null}
        <ul className="tb-account-workspace-list">
          {sources.map((source) => (
            <li key={source.id} className="tb-account-workspace-item">
              <div>
                <strong>{source.title}</strong>
                <div className="tb-template-meta">
                  <span>Workspace: {source.notebookTitle}</span>
                </div>
              </div>
              <button
                type="button"
                className="tb-button"
                disabled={deleteSourceMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Delete source "${source.title}"? This cannot be undone.`)) {
                    deleteSourceMutation.mutate(source.id);
                  }
                }}
              >
                Delete source
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="tb-card">
        <h2>Request account deletion</h2>
        <p>
          Full account deletion spans identity, database records, uploaded files, and analytics systems. Submit a request
          and we will process it manually during beta.
        </p>
        <label className="tb-field">
          <span>Notes (optional)</span>
          <textarea
            value={deletionNotes}
            onChange={(event) => setDeletionNotes(event.target.value)}
            rows={4}
            placeholder="Tell us anything we should know before deleting your account."
            data-ph-mask
          />
        </label>
        <button
          type="button"
          className="tb-button tb-button-primary"
          disabled={deletionRequestMutation.isPending}
          onClick={() => deletionRequestMutation.mutate()}
        >
          Request account deletion
        </button>
      </section>
    </div>
  );
}
