import { describe, expect, it } from "vitest";
import {
  buildSourceReadinessAfterEnrichment,
  buildSourceReadinessDuringIngestion,
} from "@studyagent/schemas";

describe("buildSourceReadinessDuringIngestion", () => {
  it("keeps learnerSourceWiki pending until projection is available", () => {
    const readiness = buildSourceReadinessDuringIngestion({
      retrievalReady: true,
      enrichmentOk: true,
      tutoringReady: true,
      projectionConfigured: true,
      updatedAt: "2026-05-31T00:00:00.000Z",
    });

    expect(readiness.wiki.ready).toBe(true);
    expect(readiness.projection.ready).toBe(false);
    expect(readiness.learnerSourceWiki.ready).toBe(false);
    expect(readiness.learnerSourceWiki.status).toBe("pending");
  });

  it("marks learnerSourceWiki degraded when projection is unavailable", () => {
    const readiness = buildSourceReadinessDuringIngestion({
      retrievalReady: true,
      enrichmentOk: true,
      tutoringReady: true,
      projectionConfigured: false,
      updatedAt: "2026-05-31T00:00:00.000Z",
    });

    expect(readiness.learnerSourceWiki.ready).toBe(false);
    expect(readiness.learnerSourceWiki.status).toBe("degraded");
    expect(readiness.learnerSourceWiki.message).toContain("projection is unavailable");
  });
});

describe("buildSourceReadinessAfterEnrichment", () => {
  it("requires wiki, planning, and projection before learnerSourceWiki is ready", () => {
    const readiness = buildSourceReadinessAfterEnrichment({
      wikiReady: true,
      planningReady: true,
      projectionReady: false,
      projectionMessage: "Projection failed",
      updatedAt: "2026-05-31T00:00:00.000Z",
    });

    expect(readiness.wiki.ready).toBe(true);
    expect(readiness.planning.ready).toBe(true);
    expect(readiness.projection.ready).toBe(false);
    expect(readiness.learnerSourceWiki.ready).toBe(false);
  });

  it("marks learnerSourceWiki ready only when all dependencies are ready", () => {
    const readiness = buildSourceReadinessAfterEnrichment({
      wikiReady: true,
      planningReady: true,
      projectionReady: true,
      updatedAt: "2026-05-31T00:00:00.000Z",
    });

    expect(readiness.learnerSourceWiki.ready).toBe(true);
    expect(readiness.learnerSourceWiki.status).toBe("ready");
  });
});
