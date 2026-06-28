import { useState } from "react";
import { ArrowLeft, FolderOpen, Layers, ListChecks, Power, RefreshCw } from "lucide-react";
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
import { Badge, Button } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";

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

function statusTone(status: string): "success" | "warning" | "danger" | "accent" | "neutral" {
  const s = status.toLowerCase();
  if (["ready", "completed", "complete", "succeeded", "done", "active"].includes(s))
    return "success";
  if (["failed", "error", "errored", "cancelled", "canceled"].includes(s)) return "danger";
  if (["pending", "queued", "processing", "running", "in_progress"].includes(s)) return "warning";
  return "neutral";
}

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
  const [busy, setBusy] = useState(false);

  async function toggleDisabled(disabled: boolean) {
    setBusy(true);
    try {
      const res = await api(`/admin/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      if (!res.ok) {
        throw new Error("Workspace update failed");
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function onToggle(disabled: boolean) {
    if (disabled && !window.confirm("Disable this workspace? Members will lose access.")) {
      return;
    }
    void toggleDisabled(disabled);
  }

  const isDisabled = Boolean(data?.workspace.disabledAt);

  return (
    <>
      <AdminPageHeader
        title="Workspace detail"
        description="Inspect workspace metadata, sources, and ingestion jobs, and manage availability."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/workspaces")}>
              <ArrowLeft className="h-4 w-4" />
              Back to workspaces
            </Button>
            <Button variant="outline" size="sm" disabled={loading} onClick={() => void reload()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {data ? (
              <Button
                variant={isDisabled ? "primary" : "danger"}
                size="sm"
                disabled={busy}
                onClick={() => onToggle(!isDisabled)}
              >
                <Power className="h-4 w-4" />
                {isDisabled ? "Enable workspace" : "Disable workspace"}
              </Button>
            ) : null}
          </>
        }
      />

      <AdminLoadingState loading={loading} error={error} />

      {data ? (
        <div className="space-y-8">
          <Reveal>
            <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-display text-[22px] font-semibold leading-tight">
                      {data.workspace.title}
                    </h2>
                    <Badge tone={isDisabled ? "danger" : "success"}>
                      {isDisabled ? "Disabled" : "Active"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                    {data.workspace.id}
                  </p>
                </div>
                <Badge tone="accent">{data.workspace.workspaceType}</Badge>
              </div>

              <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <DetailRow label="Owner" value={data.owner?.email ?? "Unknown"} />
                <DetailRow label="Type" value={data.workspace.workspaceType} />
                <DetailRow label="Template" value={data.workspace.studyTemplateId ?? "None"} />
                <DetailRow
                  label="Created"
                  value={new Date(data.workspace.createdAt).toLocaleString()}
                />
                <DetailRow
                  label="Status"
                  value={isDisabled ? "Disabled" : "Active"}
                  tone={isDisabled ? "danger" : "success"}
                />
              </dl>
            </div>
          </Reveal>

          <Reveal>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <AdminStat
                label="Sources"
                value={data.sources.length}
                icon={<FolderOpen className="h-4 w-4" />}
              />
              <AdminStat
                label="Ingestion jobs"
                value={data.ingestionJobs.length}
                icon={<Layers className="h-4 w-4" />}
              />
              <AdminStat
                label="Failed jobs"
                value={data.ingestionJobs.filter((j) => statusTone(j.status) === "danger").length}
                icon={<ListChecks className="h-4 w-4" />}
              />
            </div>
          </Reveal>

          <Reveal>
            <section className="space-y-3">
              <h3 className="font-display text-[17px] font-semibold">Sources</h3>
              {data.sources.length === 0 ? (
                <AdminEmpty message="No sources in this workspace." />
              ) : (
                <AdminTable>
                  <thead>
                    <tr>
                      <AdminTH>Title</AdminTH>
                      <AdminTH>Status</AdminTH>
                      <AdminTH>Updated</AdminTH>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map((source) => (
                      <tr key={source.id}>
                        <AdminTD className="font-medium text-foreground">{source.title}</AdminTD>
                        <AdminTD>
                          <Badge tone={statusTone(source.status)}>{source.status}</Badge>
                        </AdminTD>
                        <AdminTD className="text-muted-foreground">
                          {new Date(source.updatedAt).toLocaleString()}
                        </AdminTD>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              )}
            </section>
          </Reveal>

          <Reveal>
            <section className="space-y-3">
              <h3 className="font-display text-[17px] font-semibold">Ingestion jobs</h3>
              {data.ingestionJobs.length === 0 ? (
                <AdminEmpty message="No ingestion jobs for this workspace." />
              ) : (
                <AdminTable>
                  <thead>
                    <tr>
                      <AdminTH>Job</AdminTH>
                      <AdminTH>Status</AdminTH>
                      <AdminTH>Attempts</AdminTH>
                      <AdminTH>Error</AdminTH>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ingestionJobs.map((job) => (
                      <tr key={job.id}>
                        <AdminTD className="font-mono text-[12px] text-muted-foreground">
                          {job.id}
                        </AdminTD>
                        <AdminTD>
                          <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                        </AdminTD>
                        <AdminTD className="font-mono text-[12.5px]">
                          {job.attemptsStarted}/{job.maxAttempts}
                        </AdminTD>
                        <AdminTD className="text-destructive">{job.lastError ?? ""}</AdminTD>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              )}
            </section>
          </Reveal>
        </div>
      ) : null}
    </>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          tone === "danger"
            ? "mt-1 text-[14px] font-medium text-destructive"
            : tone === "success"
              ? "mt-1 text-[14px] font-medium text-accent"
              : "mt-1 text-[14px] text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}
