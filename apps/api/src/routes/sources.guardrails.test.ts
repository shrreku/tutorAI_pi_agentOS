import { describe, expect, it } from "vitest";
import { isAllowedUploadFile } from "./sources.js";
import { resolveIngestionStatus } from "../hosted-beta/ingestion-status.js";

describe("source upload guardrails", () => {
  it("accepts pdf, markdown, and plain text only", () => {
    expect(isAllowedUploadFile("application/pdf", "notes.pdf")).toBe(true);
    expect(isAllowedUploadFile("text/markdown", "notes.md")).toBe(true);
    expect(isAllowedUploadFile("text/plain", "notes.txt")).toBe(true);
    expect(
      isAllowedUploadFile(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "notes.docx",
      ),
    ).toBe(false);
    expect(isAllowedUploadFile("text/html", "page.html")).toBe(false);
  });

  it("renders retry and review states from metadata", () => {
    expect(
      resolveIngestionStatus({ status: "failed", metadataJson: { learnerRetryCount: 0 } })
        .retryNeeded,
    ).toBe(true);
    expect(
      resolveIngestionStatus({ status: "failed", metadataJson: { learnerRetryCount: 1 } })
        .reviewNeeded,
    ).toBe(true);
    expect(resolveIngestionStatus({ status: "ingestion_review" }).reviewNeeded).toBe(true);
  });
});
