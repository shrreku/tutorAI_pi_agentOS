export type IngestionStatusView = {
  status: string;
  queued: boolean;
  processing: boolean;
  ready: boolean;
  failed: boolean;
  retryNeeded: boolean;
  reviewNeeded: boolean;
};

const PROCESSING_STATUSES = new Set([
  "parsing",
  "chunking",
  "embedding",
  "enriching",
  "indexing",
  "processing",
  "ingesting",
]);

export function getLearnerRetryCount(
  metadataJson: Record<string, unknown> | null | undefined,
): number {
  const value = metadataJson?.learnerRetryCount;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function resolveIngestionStatus(input: {
  status: string;
  metadataJson?: Record<string, unknown> | null;
}): IngestionStatusView {
  const { status } = input;
  const learnerRetryCount = getLearnerRetryCount(input.metadataJson);

  if (status === "ingestion_review") {
    return {
      status,
      queued: false,
      processing: false,
      ready: false,
      failed: true,
      retryNeeded: false,
      reviewNeeded: true,
    };
  }

  if (status === "needs_review") {
    return {
      status,
      queued: false,
      processing: false,
      ready: false,
      failed: false,
      retryNeeded: false,
      reviewNeeded: true,
    };
  }

  if (status === "tutoring_ready" || status === "ready") {
    return {
      status,
      queued: false,
      processing: false,
      ready: true,
      failed: false,
      retryNeeded: false,
      reviewNeeded: false,
    };
  }

  if (status === "indexed") {
    return {
      status,
      queued: false,
      processing: false,
      ready: false,
      failed: false,
      retryNeeded: false,
      reviewNeeded: true,
    };
  }

  if (status === "failed") {
    const retryNeeded = learnerRetryCount < 1;
    return {
      status,
      queued: false,
      processing: false,
      ready: false,
      failed: true,
      retryNeeded,
      reviewNeeded: !retryNeeded,
    };
  }

  if (status === "uploaded") {
    return {
      status,
      queued: true,
      processing: false,
      ready: false,
      failed: false,
      retryNeeded: false,
      reviewNeeded: false,
    };
  }

  if (PROCESSING_STATUSES.has(status)) {
    return {
      status,
      queued: false,
      processing: true,
      ready: false,
      failed: false,
      retryNeeded: false,
      reviewNeeded: false,
    };
  }

  return {
    status,
    queued: false,
    processing: false,
    ready: false,
    failed: false,
    retryNeeded: false,
    reviewNeeded: false,
  };
}

export function terminalFailureStatus(
  metadataJson: Record<string, unknown>,
): "failed" | "ingestion_review" {
  return getLearnerRetryCount(metadataJson) >= 1 ? "ingestion_review" : "failed";
}
