import { describe, expect, it } from "vitest";
import { buildSourceReadiness, sourceReadinessComponent } from "./source-readiness.js";
import { resolveSourceReadiness, sourceReadinessFromLegacyStatus, toSourceLearnerView } from "./source-learner-view.js";

describe("source learner view", () => {
  it("maps legacy tutoring_ready status into learner-safe readiness copy", () => {
    const view = toSourceLearnerView({ id: "src_1", title: "Notes", status: "tutoring_ready" });
    expect(view.learnerLabel).toBe("Ready");
    expect(view.tutoringReady).toBe(true);
    expect("status" in view).toBe(false);
  });

  it("treats legacy ready status as tutoring-ready", () => {
    const view = toSourceLearnerView({ id: "src_3", title: "Notes", status: "ready" });
    expect(view.tutoringReady).toBe(true);
  });

  it("prefers persisted sourceReadiness metadata over legacy status", () => {
    const readiness = buildSourceReadiness({
      retrieval: sourceReadinessComponent(true),
      search: sourceReadinessComponent(true),
      tutoring: sourceReadinessComponent(true),
      wiki: sourceReadinessComponent(false),
      planning: sourceReadinessComponent(false),
      projection: sourceReadinessComponent(false),
      learnerSourceWiki: sourceReadinessComponent(false),
    });
    const view = toSourceLearnerView({
      id: "src_2",
      title: "Notes",
      status: "tutoring_ready",
      metadataJson: { sourceReadiness: readiness },
    });
    expect(view.learnerLabel).toBe("Ready for tutoring; Source Wiki still improving");
    expect(view.sourceWikiReady).toBe(false);
  });

  it("derives pending tutoring readiness while enrichment is running", () => {
    expect(sourceReadinessFromLegacyStatus("embedding").tutoring.ready).toBe(false);
    expect(resolveSourceReadiness({ status: "embedding" }).tutoring.status).toBe("pending");
  });

  it("maps tutor-ready wiki-pending projection-pending to degraded learner copy", () => {
    const readiness = buildSourceReadiness({
      retrieval: sourceReadinessComponent(true),
      search: sourceReadinessComponent(true),
      tutoring: sourceReadinessComponent(true),
      wiki: sourceReadinessComponent(false),
      planning: sourceReadinessComponent(true),
      projection: sourceReadinessComponent(false),
      learnerSourceWiki: sourceReadinessComponent(false),
    });
    const view = toSourceLearnerView({
      id: "src_split",
      title: "Notes",
      status: "tutoring_ready",
      metadataJson: { sourceReadiness: readiness },
    });

    expect(view.tutoringReady).toBe(true);
    expect(view.sourceWikiReady).toBe(false);
    expect(view.projectionReady).toBe(false);
    expect(view.learnerLabel).toBe("Ready for tutoring; Source Wiki still improving");
  });
});
