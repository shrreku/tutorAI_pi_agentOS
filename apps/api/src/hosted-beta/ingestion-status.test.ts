import { describe, expect, it } from "vitest";
import { resolveIngestionStatus, terminalFailureStatus } from "./ingestion-status.js";

describe("ingestion status", () => {
  it("marks uploaded sources as queued", () => {
    expect(resolveIngestionStatus({ status: "uploaded" })).toMatchObject({
      queued: true,
      processing: false,
      ready: false,
      failed: false,
    });
  });

  it("marks tutoring_ready sources as ready", () => {
    expect(resolveIngestionStatus({ status: "tutoring_ready" })).toMatchObject({
      ready: true,
      queued: false,
      processing: false,
    });
  });

  it("marks worker terminal review statuses as review-needed", () => {
    expect(resolveIngestionStatus({ status: "needs_review" })).toMatchObject({
      queued: false,
      processing: false,
      ready: false,
      failed: false,
      retryNeeded: false,
      reviewNeeded: true,
    });
    expect(resolveIngestionStatus({ status: "indexed" })).toMatchObject({
      queued: false,
      processing: false,
      ready: false,
      failed: false,
      retryNeeded: false,
      reviewNeeded: true,
    });
  });

  it("allows one learner retry before review", () => {
    expect(
      resolveIngestionStatus({ status: "failed", metadataJson: { learnerRetryCount: 0 } }),
    ).toMatchObject({
      failed: true,
      retryNeeded: true,
      reviewNeeded: false,
    });
    expect(
      resolveIngestionStatus({ status: "failed", metadataJson: { learnerRetryCount: 1 } }),
    ).toMatchObject({
      failed: true,
      retryNeeded: false,
      reviewNeeded: true,
    });
  });

  it("maps terminal failure status from retry count", () => {
    expect(terminalFailureStatus({ learnerRetryCount: 0 })).toBe("failed");
    expect(terminalFailureStatus({ learnerRetryCount: 1 })).toBe("ingestion_review");
  });
});
