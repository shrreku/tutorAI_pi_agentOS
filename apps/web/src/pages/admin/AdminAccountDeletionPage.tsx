import { useState } from "react";
import { api } from "../../routing/api.js";
import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

type DeletionRequestRow = {
  id: string;
  userId: string;
  status: string;
  notes: string | null;
  requestedAt: string;
  completedAt: string | null;
};

type DeletionRequestsResponse = { requests: DeletionRequestRow[] };

const STATUS_OPTIONS = ["requested", "in_progress", "completed", "cancelled"] as const;

export function AdminAccountDeletionPage() {
  const { data, error, loading, reload } = useAdminFetch<DeletionRequestsResponse>(
    "/admin/account-deletion-requests",
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function patchStatus(id: string, status: string) {
    setBusyId(id);
    try {
      const res = await api(`/admin/account-deletion-requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Update failed");
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="tb-card">
      <h1>Account deletion requests</h1>
      <p>Review and update manual account deletion requests during beta.</p>
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <AdminTable>
          <thead>
            <tr>
              <th>User</th>
              <th>Notes</th>
              <th>Requested</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.requests.map((row) => (
              <tr key={row.id}>
                <td>{row.userId}</td>
                <td data-ph-mask>{row.notes ?? "—"}</td>
                <td>{new Date(row.requestedAt).toLocaleString()}</td>
                <td>
                  <select
                    value={row.status}
                    disabled={busyId === row.id}
                    onChange={(event) => void patchStatus(row.id, event.target.value)}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      ) : null}
    </div>
  );
}
