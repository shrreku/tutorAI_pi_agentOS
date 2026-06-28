import { Badge, Dot } from "../ui/primitives.js";

export type IngestionStatusView = {
  status: string;
  queued: boolean;
  processing: boolean;
  ready: boolean;
  failed: boolean;
  retryNeeded: boolean;
  reviewNeeded: boolean;
};

const LABELS: Record<string, string> = {
  queued: "Queued",
  processing: "Processing",
  ready: "Ready to study",
  failed: "Failed",
  retryNeeded: "Retry needed",
  reviewNeeded: "In review",
};

function resolveLabel(status: IngestionStatusView): string {
  if (status.reviewNeeded) return LABELS.reviewNeeded ?? "In review";
  if (status.retryNeeded) return LABELS.retryNeeded ?? "Retry needed";
  if (status.ready) return LABELS.ready ?? "Ready to study";
  if (status.processing) return LABELS.processing ?? "Processing";
  if (status.queued) return LABELS.queued ?? "Queued";
  if (status.failed) return LABELS.failed ?? "Failed";
  return status.status;
}

type Tone = "neutral" | "progress" | "ready" | "danger" | "warning";

function resolveTone(status: IngestionStatusView): Tone {
  if (status.reviewNeeded) return "warning";
  if (status.retryNeeded || status.failed) return "danger";
  if (status.ready) return "ready";
  if (status.processing) return "progress";
  return "neutral";
}

const BADGE_TONE: Record<Tone, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  neutral: "neutral",
  progress: "primary",
  ready: "success",
  danger: "danger",
  warning: "warning",
};

const DOT_TONE: Record<Tone, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  neutral: "neutral",
  progress: "accent",
  ready: "success",
  danger: "danger",
  warning: "warning",
};

export function IngestionStatusBadge({ status }: { status: IngestionStatusView }) {
  const tone = resolveTone(status);
  return (
    <Badge tone={BADGE_TONE[tone]} title={status.status}>
      <Dot tone={DOT_TONE[tone]} pulse={tone === "progress"} />
      {resolveLabel(status)}
    </Badge>
  );
}
