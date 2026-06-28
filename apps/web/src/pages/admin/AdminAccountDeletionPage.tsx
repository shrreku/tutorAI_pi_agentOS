import { useState } from "react";
import { CheckCircle2, Clock, Loader2, ShieldX, Trash2, UserX } from "lucide-react";
import { api } from "../../routing/api.js";
import { Badge, Button } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";
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
type DeletionStatus = (typeof STATUS_OPTIONS)[number];

const STATUS_META: Record<
  DeletionStatus,
  { label: string; tone: "warning" | "accent" | "success" | "danger" }
> = {
  requested: { label: "Requested", tone: "warning" },
  in_progress: { label: "In progress", tone: "accent" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

function statusMeta(status: string) {
  return (
    STATUS_META[status as DeletionStatus] ?? {
      label: status,
      tone: "warning" as const,
    }
  );
}

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

  const requests = data?.requests ?? [];
  const counts = requests.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const openCount = (counts.requested ?? 0) + (counts.in_progress ?? 0);

  return (
    <>
      <AdminPageHeader
        title="Account deletion requests"
        description="Review and process manual account deletion requests during beta. Transitions take effect immediately."
      />

      <AdminLoadingState loading={loading} error={error} />

      {data ? (
        <div className="space-y-6">
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <AdminStat
                label="Open"
                value={openCount}
                hint="Awaiting action"
                icon={<UserX className="h-4 w-4" />}
              />
              <AdminStat
                label="Requested"
                value={counts.requested ?? 0}
                hint="Not yet started"
                icon={<Clock className="h-4 w-4" />}
              />
              <AdminStat
                label="In progress"
                value={counts.in_progress ?? 0}
                hint="Being processed"
                icon={<Loader2 className="h-4 w-4" />}
              />
              <AdminStat
                label="Completed"
                value={counts.completed ?? 0}
                hint="Deletion finished"
                icon={<CheckCircle2 className="h-4 w-4" />}
              />
            </div>
          </Reveal>

          {requests.length === 0 ? (
            <AdminEmpty message="No account deletion requests in the queue." />
          ) : (
            <Reveal>
              <AdminTable>
                <thead>
                  <tr>
                    <AdminTH>User</AdminTH>
                    <AdminTH>Notes</AdminTH>
                    <AdminTH>Requested</AdminTH>
                    <AdminTH>Status</AdminTH>
                    <AdminTH className="text-right">Actions</AdminTH>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((row) => {
                    const meta = statusMeta(row.status);
                    const busy = busyId === row.id;
                    const terminal = row.status === "completed" || row.status === "cancelled";
                    return (
                      <tr key={row.id}>
                        <AdminTD>
                          <span className="font-mono text-[12.5px] text-foreground">
                            {row.userId}
                          </span>
                        </AdminTD>
                        <AdminTD className="max-w-xs">
                          <span
                            data-ph-mask
                            className="block truncate text-muted-foreground"
                            title={row.notes ?? undefined}
                          >
                            {row.notes ?? "—"}
                          </span>
                        </AdminTD>
                        <AdminTD>
                          <span className="whitespace-nowrap text-muted-foreground">
                            {new Date(row.requestedAt).toLocaleString()}
                          </span>
                        </AdminTD>
                        <AdminTD>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </AdminTD>
                        <AdminTD>
                          <div className="flex items-center justify-end gap-2">
                            {row.status === "requested" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void patchStatus(row.id, "in_progress")}
                              >
                                <Loader2 className="h-3.5 w-3.5" />
                                Start
                              </Button>
                            ) : null}
                            {!terminal ? (
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Mark this account deletion as completed? This indicates the user's data has been permanently removed.",
                                    )
                                  ) {
                                    void patchStatus(row.id, "completed");
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Complete
                              </Button>
                            ) : null}
                            {!terminal ? (
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Cancel this account deletion request? The user's account will be retained.",
                                    )
                                  ) {
                                    void patchStatus(row.id, "cancelled");
                                  }
                                }}
                              >
                                <ShieldX className="h-3.5 w-3.5" />
                                Cancel
                              </Button>
                            ) : null}
                            {terminal ? (
                              <span className="text-[12.5px] text-muted-foreground">
                                {row.completedAt
                                  ? `Closed ${new Date(row.completedAt).toLocaleDateString()}`
                                  : "Closed"}
                              </span>
                            ) : null}
                          </div>
                        </AdminTD>
                      </tr>
                    );
                  })}
                </tbody>
              </AdminTable>
            </Reveal>
          )}
        </div>
      ) : null}
    </>
  );
}
