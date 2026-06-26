import { useState } from "react";
import { api } from "../../routing/api.js";
import { IngestionStatusBadge } from "../../components/IngestionStatusBadge.js";
import type { IngestionStatusView } from "../../components/IngestionStatusBadge.js";
import { AdminLoadingState, AdminTable, useAdminFetch } from "./adminShared.js";

type IngestionSourceRow = {
  source: { id: string; title: string; status: string; metadataJson: Record<string, unknown> };
  notebookTitle: string;
  ownerEmail: string;
};

type IngestionSourcesResponse = { sources: IngestionSourceRow[] };

type TriggerRunsResponse = {
  runs: Array<{
    id: string;
    triggeredBy: string;
    status: string;
    jobsClaimed: number;
    jobsCompleted: number;
    jobsFailed: number;
    startedAt: string;
  }>;
};

function toIngestionStatus(source: IngestionSourceRow["source"]): IngestionStatusView {
  const learnerRetryCount =
    typeof source.metadataJson.learnerRetryCount === "number"
      ? source.metadataJson.learnerRetryCount
      : 0;
  if (source.status === "ingestion_review") {
    return {
      status: source.status,
      queued: false,
      processing: false,
      ready: false,
      failed: true,
      retryNeeded: false,
      reviewNeeded: true,
    };
  }
  if (source.status === "failed") {
    return {
      status: source.status,
      queued: false,
      processing: false,
      ready: false,
      failed: true,
      retryNeeded: learnerRetryCount < 1,
      reviewNeeded: learnerRetryCount >= 1,
    };
  }
  if (source.status === "uploaded") {
    return {
      status: source.status,
      queued: true,
      processing: false,
      ready: false,
      failed: false,
      retryNeeded: false,
      reviewNeeded: false,
    };
  }
  if (source.status === "tutoring_ready" || source.status === "ready") {
    return {
      status: source.status,
      queued: false,
      processing: false,
      ready: true,
      failed: false,
      retryNeeded: false,
      reviewNeeded: false,
    };
  }
  return {
    status: source.status,
    queued: false,
    processing: true,
    ready: false,
    failed: false,
    retryNeeded: false,
    reviewNeeded: false,
  };
}

export function AdminIngestionPage() {
  const { data, error, loading, reload } = useAdminFetch<IngestionSourcesResponse>(
    "/admin/ingestion/sources",
  );
  const { data: runsData } = useAdminFetch<TriggerRunsResponse>("/admin/ingestion/trigger-runs");
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function triggerDrain() {
    setBusy(true);
    setTriggerMessage(null);
    try {
      const res = await api("/admin/ingestion/trigger", { method: "POST" });
      const body = (await res.json()) as { runId?: string; status?: string; message?: string };
      setTriggerMessage(
        body.runId ? `Trigger ${body.status} (${body.runId})` : (body.message ?? "Triggered"),
      );
      await reload();
    } catch (err) {
      setTriggerMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tb-card">
      <h1>Ingestion</h1>
      <p>
        Review queued, failed, and review-needed sources. Manually trigger a one-shot worker drain.
      </p>
      <button
        type="button"
        className="tb-button tb-button-primary"
        disabled={busy}
        onClick={() => void triggerDrain()}
      >
        Trigger worker drain
      </button>
      {triggerMessage ? <p>{triggerMessage}</p> : null}
      <AdminLoadingState loading={loading} error={error} />
      {data ? (
        <AdminTable>
          <thead>
            <tr>
              <th>Source</th>
              <th>Workspace</th>
              <th>Owner</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((row) => (
              <tr key={row.source.id}>
                <td>{row.source.title}</td>
                <td>{row.notebookTitle}</td>
                <td>{row.ownerEmail}</td>
                <td>
                  <IngestionStatusBadge status={toIngestionStatus(row.source)} />
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      ) : null}
      {runsData?.runs.length ? (
        <>
          <h2>Recent trigger runs</h2>
          <AdminTable>
            <thead>
              <tr>
                <th>Run</th>
                <th>By</th>
                <th>Status</th>
                <th>Jobs</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {runsData.runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.id}</td>
                  <td>{run.triggeredBy}</td>
                  <td>{run.status}</td>
                  <td>
                    {run.jobsCompleted}/{run.jobsClaimed} ({run.jobsFailed} failed)
                  </td>
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </>
      ) : null}
    </div>
  );
}
