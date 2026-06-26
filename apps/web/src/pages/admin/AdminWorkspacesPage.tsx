import { useState } from "react";
import { api } from "../../routing/api.js";
import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

type WorkspaceRow = {
  id: string;
  title: string;
  ownerEmail: string;
  workspaceType: string;
  disabledAt: string | null;
};

type WorkspacesResponse = { workspaces: WorkspaceRow[] };

export function AdminWorkspacesPage({ navigate }: { navigate: (path: string) => void }) {
  const { data, error, loading, reload } = useAdminFetch<WorkspacesResponse>("/admin/workspaces");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleDisabled(notebookId: string, disabled: boolean) {
    setBusyId(notebookId);
    try {
      const res = await api(`/admin/workspaces/${encodeURIComponent(notebookId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      if (!res.ok) throw new Error("Update failed");
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="tb-card">
      <h1>Workspaces</h1>
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <AdminTable>
          <thead>
            <tr>
              <th>Title</th>
              <th>Owner</th>
              <th>Type</th>
              <th>Disabled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.workspaces.map((workspace) => (
              <tr key={workspace.id}>
                <td>
                  <button
                    type="button"
                    className="tb-inline-link"
                    onClick={() =>
                      navigate(`/admin/workspaces/${encodeURIComponent(workspace.id)}`)
                    }
                  >
                    {workspace.title}
                  </button>
                </td>
                <td>{workspace.ownerEmail}</td>
                <td>{workspace.workspaceType}</td>
                <td>{workspace.disabledAt ? "Yes" : "No"}</td>
                <td>
                  <button
                    type="button"
                    disabled={busyId === workspace.id}
                    onClick={() => void toggleDisabled(workspace.id, !workspace.disabledAt)}
                  >
                    {workspace.disabledAt ? "Enable" : "Disable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      ) : null}
    </div>
  );
}
