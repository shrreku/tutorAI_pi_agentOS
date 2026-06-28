import { useMemo, useState } from "react";
import { Ban, CheckCircle2, ShieldCheck, Sparkles, Database } from "lucide-react";
import { api } from "../../routing/api.js";
import {
  AdminEmpty,
  AdminLoadingState,
  AdminPageHeader,
  AdminTable,
  AdminTD,
  AdminTH,
  useAdminFetch,
} from "./adminShared.js";
import { Badge, Button, Input } from "../../ui/primitives.js";

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
  const [query, setQuery] = useState("");

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

  const users = data?.users ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = u.displayName?.toLowerCase() ?? "";
      return u.email.toLowerCase().includes(q) || name.includes(q);
    });
  }, [users, query]);

  return (
    <>
      <AdminPageHeader
        title="Users"
        description="Manage member access, entitlements, and account status across the workspace."
        actions={
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email or name…"
            className="w-64"
            aria-label="Search users"
          />
        }
      />

      <AdminLoadingState loading={loading} error={error} />

      {data ? (
        filtered.length === 0 ? (
          <AdminEmpty
            message={query.trim() ? `No users match “${query.trim()}”.` : "No users found."}
          />
        ) : (
          <AdminTable>
            <thead>
              <tr>
                <AdminTH>Member</AdminTH>
                <AdminTH>Entitlements</AdminTH>
                <AdminTH>Status</AdminTH>
                <AdminTH className="text-right">Actions</AdminTH>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const busy = busyId === user.id;
                return (
                  <tr key={user.id} className="transition-colors hover:bg-surface/40">
                    <AdminTD>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/users/${encodeURIComponent(user.id)}`)}
                        className="group text-left"
                      >
                        <div className="font-medium text-foreground underline-offset-4 group-hover:text-accent group-hover:underline">
                          {user.email}
                        </div>
                        {user.displayName ? (
                          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                            {user.displayName}
                          </div>
                        ) : null}
                      </button>
                    </AdminTD>
                    <AdminTD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {user.studyAccess ? (
                          <Badge tone="success">
                            <Sparkles className="h-3 w-3" /> Study
                          </Badge>
                        ) : null}
                        {user.ingestionAccess ? (
                          <Badge tone="accent">
                            <Database className="h-3 w-3" /> Ingestion
                          </Badge>
                        ) : null}
                        {user.adminAccess ? (
                          <Badge tone="gold">
                            <ShieldCheck className="h-3 w-3" /> Admin
                          </Badge>
                        ) : null}
                        {!user.studyAccess && !user.ingestionAccess && !user.adminAccess ? (
                          <span className="text-[12.5px] text-muted-foreground">No access</span>
                        ) : null}
                      </div>
                    </AdminTD>
                    <AdminTD>
                      {user.disabledAt ? (
                        <Badge tone="danger">
                          <Ban className="h-3 w-3" /> Disabled
                        </Badge>
                      ) : (
                        <Badge tone="success">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </Badge>
                      )}
                    </AdminTD>
                    <AdminTD className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Button
                          variant={user.studyAccess ? "outline" : "ghost"}
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void patchUser(user.id, { studyAccess: !user.studyAccess })
                          }
                        >
                          {user.studyAccess ? "Revoke study" : "Grant study"}
                        </Button>
                        <Button
                          variant={user.ingestionAccess ? "outline" : "ghost"}
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void patchUser(user.id, {
                              ingestionAccess: !user.ingestionAccess,
                            })
                          }
                        >
                          {user.ingestionAccess ? "Revoke ingestion" : "Grant ingestion"}
                        </Button>
                        <Button
                          variant={user.adminAccess ? "outline" : "ghost"}
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void patchUser(user.id, { adminAccess: !user.adminAccess })
                          }
                        >
                          {user.adminAccess ? "Revoke admin" : "Grant admin"}
                        </Button>
                        <Button
                          variant={user.disabledAt ? "primary" : "danger"}
                          size="sm"
                          disabled={busy}
                          onClick={() => void patchUser(user.id, { disabled: !user.disabledAt })}
                        >
                          {user.disabledAt ? "Enable" : "Disable"}
                        </Button>
                      </div>
                    </AdminTD>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        )
      ) : null}
    </>
  );
}
