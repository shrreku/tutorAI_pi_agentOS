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
});
