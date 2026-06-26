import { useState } from "react";
import { api } from "../../routing/api.js";
import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  disabledAt: string | null;
  studyAccess: number | null;
  ingestionAccess: number | null;
  adminAccess: number | null;
};

type UsersResponse = { users: UserRow[] };

export function AdminUsersPage({ navigate }: { navigate: (path: string) => void }) {
  const { data, error, loading, reload } = useAdminFetch<UsersResponse>("/admin/users");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function patchUser(userId: string, body: Record<string, boolean>) {
    setBusyId(userId);
    try {
      const res = await api(`/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json()) as { message?: string };
        throw new Error(payload.message ?? "Update failed");
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="tb-card">
      <h1>Users</h1>
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <AdminTable>
          <thead>
            <tr>
              <th>Email</th>
              <th>Study</th>
              <th>Ingestion</th>
              <th>Admin</th>
              <th>Disabled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((user) => (
              <tr key={user.id}>
                <td>
                  <button type="button" className="tb-inline-link" onClick={() => navigate(`/admin/users/${encodeURIComponent(user.id)}`)}>
                    {user.email}
                  </button>
                </td>
                <td>{user.studyAccess ? "Yes" : "No"}</td>
                <td>{user.ingestionAccess ? "Yes" : "No"}</td>
                <td>{user.adminAccess ? "Yes" : "No"}</td>
                <td>{user.disabledAt ? "Yes" : "No"}</td>
                <td className="tb-admin-actions">
                  <button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => void patchUser(user.id, { studyAccess: !user.studyAccess })}
                  >
                    Toggle study
                  </button>
                  <button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => void patchUser(user.id, { ingestionAccess: !user.ingestionAccess })}
                  >
                    Toggle ingestion
                  </button>
                  <button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => void patchUser(user.id, { adminAccess: !user.adminAccess })}
                  >
                    Toggle admin
                  </button>
                  <button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => void patchUser(user.id, { disabled: !user.disabledAt })}
                  >
                    {user.disabledAt ? "Enable" : "Disable"}
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
