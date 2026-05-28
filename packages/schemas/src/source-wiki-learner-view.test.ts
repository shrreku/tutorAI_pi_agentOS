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
});
