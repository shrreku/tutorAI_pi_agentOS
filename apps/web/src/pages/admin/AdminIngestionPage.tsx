import { useState } from "react";
import { CheckCircle2, Database, History, Loader2, PlayCircle, ScrollText } from "lucide-react";
import { api } from "../../routing/api.js";
import type { IngestionStatusView } from "../../components/IngestionStatusBadge.js";
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
import { Badge, Button, Dot } from "../../ui/primitives.js";
import { Reveal } from "../../ui/motion.js";

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

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  processing: "Processing",
  ready: "Ready to study",
  failed: "Failed",
  retryNeeded: "Retry needed",
  reviewNeeded: "In review",
};

function resolveStatusLabel(status: IngestionStatusView): string {
  if (status.reviewNeeded) return STATUS_LABELS.reviewNeeded ?? "In review";
  if (status.retryNeeded) return STATUS_LABELS.retryNeeded ?? "Retry needed";
  if (status.ready) return STATUS_LABELS.ready ?? "Ready to study";
  if (status.processing) return STATUS_LABELS.processing ?? "Processing";
  if (status.queued) return STATUS_LABELS.queued ?? "Queued";
  if (status.failed) return STATUS_LABELS.failed ?? "Failed";
  return status.status;
}

type BadgeTone = "neutral" | "accent" | "primary" | "gold" | "success" | "warning" | "danger";
type DotTone = "neutral" | "accent" | "success" | "warning" | "danger";

function resolveStatusTones(status: IngestionStatusView): {
  badge: BadgeTone;
  dot: DotTone;
  pulse: boolean;
} {
  if (status.reviewNeeded) return { badge: "warning", dot: "warning", pulse: false };
  if (status.retryNeeded || status.failed) return { badge: "danger", dot: "danger", pulse: false };
  if (status.ready) return { badge: "success", dot: "success", pulse: false };
  if (status.processing) return { badge: "accent", dot: "accent", pulse: true };
  if (status.queued) return { badge: "neutral", dot: "neutral", pulse: false };
  return { badge: "neutral", dot: "neutral", pulse: false };
}

function IngestionStatusPill({ status }: { status: IngestionStatusView }) {
  const tones = resolveStatusTones(status);
  return (
    <Badge tone={tones.badge} title={status.status}>
      <Dot tone={tones.dot} pulse={tones.pulse} />
      {resolveStatusLabel(status)}
    </Badge>
  );
}

function runStatusTone(status: string): BadgeTone {
  const normalized = status.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error")) return "danger";
  if (normalized.includes("complete") || normalized.includes("success") || normalized === "ok")
    return "success";
  if (normalized.includes("run") || normalized.includes("progress") || normalized.includes("pend"))
    return "accent";
  return "neutral";
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

  const sources = data?.sources ?? [];
  const counts = sources.reduce(
    (acc, row) => {
      const view = toIngestionStatus(row.source);
      acc.total += 1;
      if (view.ready) acc.ready += 1;
      else if (view.reviewNeeded || view.retryNeeded || view.failed) acc.attention += 1;
      else acc.inFlight += 1;
      return acc;
    },
    { total: 0, ready: 0, attention: 0, inFlight: 0 },
  );

  return (
    <div>
      <AdminPageHeader
        title="Ingestion"
        description="Review queued, failed, and review-needed sources. Manually trigger a one-shot worker drain."
        actions={
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void triggerDrain()}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Trigger worker drain
          </Button>
        }
      />

      {triggerMessage ? (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/8 px-4 py-3 text-[13.5px] text-accent">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{triggerMessage}</span>
        </div>
      ) : null}

      {data ? (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <AdminStat label="Sources" value={counts.total} icon={<Database className="h-4 w-4" />} />
          <AdminStat
            label="Ready"
            value={counts.ready}
            hint="Tutoring-ready"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <AdminStat
            label="In flight"
            value={counts.inFlight}
            hint="Queued or processing"
            icon={<Loader2 className="h-4 w-4" />}
          />
          <AdminStat
            label="Needs attention"
            value={counts.attention}
            hint="Failed, retry, or review"
            icon={<ScrollText className="h-4 w-4" />}
          />
        </div>
      ) : null}

      <AdminLoadingState loading={loading} error={error} />

      {data ? (
        <Reveal className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-accent" />
            <h2 className="font-display text-[18px] font-semibold leading-tight">Sources</h2>
          </div>
          {sources.length === 0 ? (
            <AdminEmpty message="No ingestion sources yet." />
          ) : (
            <AdminTable>
              <thead>
                <tr>
                  <AdminTH>Source</AdminTH>
                  <AdminTH>Workspace</AdminTH>
                  <AdminTH>Owner</AdminTH>
                  <AdminTH>Status</AdminTH>
                </tr>
              </thead>
              <tbody>
                {sources.map((row) => (
                  <tr key={row.source.id} className="transition-colors hover:bg-surface/50">
                    <AdminTD className="font-medium text-foreground">{row.source.title}</AdminTD>
                    <AdminTD className="text-muted-foreground">{row.notebookTitle}</AdminTD>
                    <AdminTD className="font-mono text-[12.5px] text-muted-foreground">
                      {row.ownerEmail}
                    </AdminTD>
                    <AdminTD>
                      <IngestionStatusPill status={toIngestionStatus(row.source)} />
                    </AdminTD>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          )}
        </Reveal>
      ) : null}

      {runsData?.runs.length ? (
        <Reveal delay={0.05}>
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-gold" />
            <h2 className="font-display text-[18px] font-semibold leading-tight">
              Recent trigger runs
            </h2>
          </div>
          <AdminTable>
            <thead>
              <tr>
                <AdminTH>Run</AdminTH>
                <AdminTH>By</AdminTH>
                <AdminTH>Status</AdminTH>
                <AdminTH>Jobs</AdminTH>
                <AdminTH>Started</AdminTH>
              </tr>
            </thead>
            <tbody>
              {runsData.runs.map((run) => (
                <tr key={run.id} className="transition-colors hover:bg-surface/50">
                  <AdminTD className="font-mono text-[12px] text-muted-foreground">
                    {run.id}
                  </AdminTD>
                  <AdminTD className="text-muted-foreground">{run.triggeredBy}</AdminTD>
                  <AdminTD>
                    <Badge tone={runStatusTone(run.status)} title={run.status}>
                      {run.status}
                    </Badge>
                  </AdminTD>
                  <AdminTD>
                    <span className="font-medium text-foreground">
                      {run.jobsCompleted}/{run.jobsClaimed}
                    </span>
                    {run.jobsFailed > 0 ? (
                      <span className="ml-1.5 text-destructive">({run.jobsFailed} failed)</span>
                    ) : null}
                  </AdminTD>
                  <AdminTD className="text-muted-foreground">
                    {new Date(run.startedAt).toLocaleString()}
                  </AdminTD>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        </Reveal>
      ) : null}
    </div>
  );
}
