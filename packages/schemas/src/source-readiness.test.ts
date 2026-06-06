import { describe, expect, it } from "vitest";
import { buildSourceReadiness, learnerSourceStatus, sourceReadinessComponent } from "./source-readiness.js";

describe("source readiness", () => {
  it("keeps tutoring readiness separate from Source Wiki and projection readiness", () => {
    const readiness = buildSourceReadiness({
      retrieval: sourceReadinessComponent(true),
      search: sourceReadinessComponent(true),
      tutoring: sourceReadinessComponent(true),
      wiki: sourceReadinessComponent(false),
      projection: sourceReadinessComponent(false),
      learnerSourceWiki: sourceReadinessComponent(false),
    });

    expect(readiness.tutoring.ready).toBe(true);
    expect(readiness.learnerSourceWiki.ready).toBe(false);
    expect(learnerSourceStatus(readiness).label).toBe("Ready for tutoring; Source Wiki still improving");
  });

  it("keeps graph projection readiness separate from tutoring readiness", () => {
    const readiness = buildSourceReadiness({
      retrieval: sourceReadinessComponent(true),
      search: sourceReadinessComponent(true),
      tutoring: sourceReadinessComponent(true),
      wiki: sourceReadinessComponent(true),
      planning: sourceReadinessComponent(true),
      projection: sourceReadinessComponent(false),
      learnerSourceWiki: sourceReadinessComponent(true),
    });

    expect(readiness.tutoring.ready).toBe(true);
    expect(readiness.projection.ready).toBe(false);
    expect(readiness.learnerSourceWiki.ready).toBe(true);
    expect(learnerSourceStatus(readiness).label).toBe("Ready for tutoring; Source Wiki still improving");
  });

  it("returns Ready when tutoring, learnerSourceWiki, and projection are all ready", () => {
    const readiness = buildSourceReadiness({
      retrieval: sourceReadinessComponent(true),
      search: sourceReadinessComponent(true),
      tutoring: sourceReadinessComponent(true),
      wiki: sourceReadinessComponent(true),
      planning: sourceReadinessComponent(true),
      projection: sourceReadinessComponent(true),
      learnerSourceWiki: sourceReadinessComponent(true),
    });

    expect(learnerSourceStatus(readiness).label).toBe("Ready");
  });

  it("returns Preparing for tutoring when tutoring.ready is false", () => {
    const readiness = buildSourceReadiness({
      retrieval: sourceReadinessComponent(true),
      search: sourceReadinessComponent(false, { status: "pending" }),
      tutoring: sourceReadinessComponent(false, { status: "pending", message: "Still preparing tutoring context" }),
      wiki: sourceReadinessComponent(false),
      planning: sourceReadinessComponent(false),
      projection: sourceReadinessComponent(false),
      learnerSourceWiki: sourceReadinessComponent(false),
    });

    expect(learnerSourceStatus(readiness).label).toBe("Preparing for tutoring");
  });

  it("defaults missing readiness components to pending", () => {
    const readiness = buildSourceReadiness({
      tutoring: sourceReadinessComponent(true),
    });

    expect(readiness.wiki.ready).toBe(false);
    expect(readiness.wiki.status).toBe("pending");
    expect(readiness.projection.ready).toBe(false);
  });
});
