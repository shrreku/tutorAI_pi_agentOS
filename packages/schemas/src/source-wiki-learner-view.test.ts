import { describe, expect, it } from "vitest";
import { buildSourceWikiLearnerView } from "./source-wiki-learner-view.js";

describe("Source Wiki learner view", () => {
  it("hides raw claim states and low-support claims from learner mode", () => {
    const view = buildSourceWikiLearnerView({
      page: { id: "wp_1", title: "Voltage", status: "published", markdown: "## Voltage" },
      claims: [
        { id: "clm_ok", status: "published", claimText: "Voltage drives current.", confidence: 0.8, supportScore: 0.7, evidence: [{ sourceRef: "chunk:1", excerpt: "Voltage..." }] },
        { id: "clm_candidate", status: "candidate", claimText: "Raw candidate", confidence: 0.9, supportScore: 0.9, evidence: [{ sourceRef: "chunk:2", excerpt: "Candidate" }] },
        { id: "clm_low", status: "published", claimText: "Weak claim", confidence: 0.4, supportScore: 0.9, evidence: [{ sourceRef: "chunk:3", excerpt: "Weak" }] },
      ],
    });

    expect(view.debug).toBeNull();
    expect(view.evidenceGroups).toHaveLength(1);
    expect(view.evidenceGroups[0]?.title).toBe("Voltage drives current.");
    expect(JSON.stringify(view)).not.toContain("clm_candidate");
  });

  it("exposes raw partitions only in Dev Mode", () => {
    const view = buildSourceWikiLearnerView({
      page: { id: "wp_1", title: "Voltage", status: "draft", markdown: "Draft" },
      devMode: true,
      claims: [{ id: "clm_candidate", status: "candidate", claimText: "Raw candidate", confidence: 0.9, supportScore: 0.9, evidence: [] }],
    });

    expect(view.learnerStatus).toBe("needs_source_support");
    expect(view.debug).toMatchObject({ rawPageStatus: "draft", hiddenClaimIds: ["clm_candidate"] });
  });

  it("marks pages without published claims as needing source support", () => {
    const view = buildSourceWikiLearnerView({
      page: { id: "wp_2", title: "Empty", status: "published", markdown: "Draft body" },
      claims: [],
    });

    expect(view.learnerStatus).toBe("needs_source_support");
    expect(view.evidenceGroups).toHaveLength(0);
  });

  it("groups multiple published claims under one learner evidence group per claim", () => {
    const view = buildSourceWikiLearnerView({
      page: { id: "wp_3", title: "Current", status: "published", markdown: "Current" },
      claims: [
        { id: "clm_a", status: "published", claimText: "Ohm's law relates voltage and current.", confidence: 0.8, supportScore: 0.75, evidence: [{ sourceRef: "chunk:1", excerpt: "V=IR" }] },
        { id: "clm_b", status: "published", claimText: "Resistance opposes current flow.", confidence: 0.85, supportScore: 0.8, evidence: [{ sourceRef: "chunk:2", excerpt: "resistance" }] },
      ],
    });

    expect(view.evidenceGroups).toHaveLength(2);
    expect(view.evidenceGroups.map((group) => group.title)).toEqual([
      "Ohm's law relates voltage and current.",
      "Resistance opposes current flow.",
    ]);
  });

  it("hides contradicted and superseded claims in learner mode", () => {
    const view = buildSourceWikiLearnerView({
      page: { id: "wp_4", title: "Claims", status: "published", markdown: "Claims" },
      claims: [
        { id: "clm_ok", status: "published", claimText: "Visible claim.", confidence: 0.8, supportScore: 0.7, evidence: [{ sourceRef: "chunk:1", excerpt: "ok" }] },
        { id: "clm_contra", status: "contradicted", claimText: "Hidden contradicted.", confidence: 0.9, supportScore: 0.9, evidence: [{ sourceRef: "chunk:2", excerpt: "no" }] },
        { id: "clm_super", status: "superseded", claimText: "Hidden superseded.", confidence: 0.9, supportScore: 0.9, evidence: [{ sourceRef: "chunk:3", excerpt: "no" }] },
      ],
    });

    expect(view.evidenceGroups).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain("clm_contra");
    expect(JSON.stringify(view)).not.toContain("clm_super");
  });

  it("maps failed page status to temporarily_unavailable", () => {
    const view = buildSourceWikiLearnerView({
      page: { id: "wp_failed", title: "Broken", status: "failed", markdown: "Unavailable" },
      claims: [],
    });

    expect(view.learnerStatus).toBe("temporarily_unavailable");
    expect(view.warnings.some((warning) => warning.includes("temporarily unavailable"))).toBe(true);
  });

  it("maps draft page with visible claims to still_improving", () => {
    const view = buildSourceWikiLearnerView({
      page: { id: "wp_draft", title: "Draft", status: "draft", markdown: "Draft body" },
      claims: [{
        id: "clm_published",
        status: "published",
        claimText: "Draft page claim.",
        confidence: 0.8,
        supportScore: 0.7,
        evidence: [{ sourceRef: "chunk:1", excerpt: "draft" }],
      }],
    });

    expect(view.learnerStatus).toBe("still_improving");
    expect(view.warnings.some((warning) => warning.includes("still improving"))).toBe(true);
  });

  it("does not leak raw confidence or claim ids in learner mode JSON", () => {
    const view = buildSourceWikiLearnerView({
      page: { id: "wp_5", title: "Privacy", status: "published", markdown: "Privacy" },
      claims: [{ id: "clm_secret", status: "published", claimText: "Safe claim.", confidence: 0.82, supportScore: 0.76, evidence: [{ sourceRef: "chunk:1", excerpt: "safe" }] }],
    });

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("clm_secret");
    expect(serialized).not.toContain("\"confidence\"");
    expect(serialized).not.toContain("0.82");
  });
});
