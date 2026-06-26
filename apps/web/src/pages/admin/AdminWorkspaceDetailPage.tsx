import { api } from "../../routing/api.js";
import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

type WorkspaceDetailResponse = {
  workspace: {
    id: string;
    title: string;
    workspaceType: string;
    studyTemplateId: string | null;
    disabledAt: string | null;
    createdAt: string;
  };
  owner: { id: string; email: string } | null;
  sources: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  ingestionJobs: Array<{
    id: string;
    status: string;
    attemptsStarted: number;
    maxAttempts: number;
    lastError: string | null;
  }>;
};

export function AdminWorkspaceDetailPage({
  workspaceId,
  navigate,
}: {
  workspaceId: string;
  navigate: (path: string) => void;
}) {
  const { data, error, loading, reload } = useAdminFetch<WorkspaceDetailResponse>(
    `/admin/workspaces/${encodeURIComponent(workspaceId)}`,
  );

  async function toggleDisabled(disabled: boolean) {
    const res = await api(`/admin/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled }),
    });
    if (!res.ok) {
      throw new Error("Workspace update failed");
    }
    await reload();
  }

  return (
    <div className="tb-card">
      <button type="button" className="tb-button" onClick={() => navigate("/admin/workspaces")}>
        Back to workspaces
      </button>
      <h1>Workspace detail</h1>
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <>
          <dl className="tb-admin-detail">
            <div>
              <dt>Title</dt>
              <dd>{data.workspace.title}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{data.owner?.email ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{data.workspace.workspaceType}</dd>
            </div>
            <div>
              <dt>Template</dt>
              <dd>{data.workspace.studyTemplateId ?? "None"}</dd>
            </div>
            <div>
              <dt>Disabled</dt>
              <dd>{data.workspace.disabledAt ? "Yes" : "No"}</dd>
            </div>
          </dl>
          <div className="tb-actions">
            <button
              type="button"
              className="tb-button"
              onClick={() => void toggleDisabled(!data.workspace.disabledAt)}
            >
              {data.workspace.disabledAt ? "Enable workspace" : "Disable workspace"}
            </button>
          </div>

          <h2>Sources</h2>
          <AdminTable>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((source) => (
                <tr key={source.id}>
                  <td>{source.title}</td>
                  <td>{source.status}</td>
                  <td>{new Date(source.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>

          <h2>Ingestion jobs</h2>
          <AdminTable>
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {data.ingestionJobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>{job.status}</td>
                  <td>
                    {job.attemptsStarted}/{job.maxAttempts}
                  </td>
                  <td>{job.lastError ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </>
      ) : null}
    </div>
  );
}
