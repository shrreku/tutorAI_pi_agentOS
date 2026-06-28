import { useMemo, useState } from "react";
import { Ban, CheckCircle2, FolderOpen, Search } from "lucide-react";
import { api } from "../../routing/api.js";
import {
  AdminEmpty,
  AdminLoadingState,
  AdminPageHeader,
  AdminStat,
  AdminTable,
  AdminTD,
  AdminTH,
  useAdminFetch,
} from "./adminShared.js";
import { Badge, Button, Input } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";

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
  const [query, setQuery] = useState("");

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

  const workspaces = data?.workspaces ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(
      (w) =>
        w.title.toLowerCase().includes(q) ||
        w.ownerEmail.toLowerCase().includes(q) ||
        w.workspaceType.toLowerCase().includes(q),
    );
  }, [workspaces, query]);

  const activeCount = workspaces.filter((w) => !w.disabledAt).length;
  const disabledCount = workspaces.length - activeCount;

  return (
    <>
      <AdminPageHeader
        title="Workspaces"
        description="Every learner workspace across the platform. Open one to inspect detail, or disable to suspend access."
        actions={<Badge tone="outline">{workspaces.length} total</Badge>}
      />

      <AdminLoadingState loading={loading} error={error} />

      {data ? (
        <Reveal className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <AdminStat
              label="Total"
              value={workspaces.length}
              hint="All workspaces"
              icon={<FolderOpen className="h-4 w-4" />}
            />
            <AdminStat
              label="Active"
              value={activeCount}
              hint="Currently enabled"
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <AdminStat
              label="Disabled"
              value={disabledCount}
              hint="Suspended access"
              icon={<Ban className="h-4 w-4" />}
            />
          </div>

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, owner, or type…"
              className="pl-9"
              aria-label="Search workspaces"
            />
          </div>

          {filtered.length === 0 ? (
            <AdminEmpty
              message={
                query.trim()
                  ? "No workspaces match your search."
                  : "No workspaces have been created yet."
              }
            />
          ) : (
            <AdminTable>
              <thead>
                <tr>
                  <AdminTH>Title</AdminTH>
                  <AdminTH>Owner</AdminTH>
                  <AdminTH>Type</AdminTH>
                  <AdminTH>Status</AdminTH>
                  <AdminTH className="text-right">Actions</AdminTH>
                </tr>
              </thead>
              <tbody>
                {filtered.map((workspace) => {
                  const isDisabled = Boolean(workspace.disabledAt);
                  return (
                    <tr key={workspace.id} className="transition-colors hover:bg-surface/50">
                      <AdminTD>
                        <button
                          type="button"
                          className="text-left font-medium text-accent underline-offset-4 hover:underline"
                          onClick={() =>
                            navigate(`/admin/workspaces/${encodeURIComponent(workspace.id)}`)
                          }
                        >
                          {workspace.title}
                        </button>
                      </AdminTD>
                      <AdminTD className="text-muted-foreground">{workspace.ownerEmail}</AdminTD>
                      <AdminTD>
                        <Badge tone="neutral">{workspace.workspaceType}</Badge>
                      </AdminTD>
                      <AdminTD>
                        {isDisabled ? (
                          <Badge tone="danger">Disabled</Badge>
                        ) : (
                          <Badge tone="success">Active</Badge>
                        )}
                      </AdminTD>
                      <AdminTD className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={isDisabled ? "outline" : "danger"}
                          disabled={busyId === workspace.id}
                          onClick={() => void toggleDisabled(workspace.id, !isDisabled)}
                        >
                          {busyId === workspace.id ? "Saving…" : isDisabled ? "Enable" : "Disable"}
                        </Button>
                      </AdminTD>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTable>
          )}
        </Reveal>
      ) : null}
    </>
  );
}
