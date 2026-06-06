import { describe, expect, it } from "vitest";
import { assertLearnerSafeCopy, learnerFacingNodeTypeLabel, learnerFacingPipelineStatus, learnerSafeCopy, learnerSafeValue } from "./learner-copy.js";

describe("learner copy guard", () => {
  it("maps raw pipeline vocabulary into product copy", () => {
    const copy = learnerSafeCopy("source is tutoring_ready with objective_list and session_plan refs");
    expect(copy).toContain("Ready to study");
    expect(copy).toContain("session objectives");
    expect(copy).not.toContain("tutoring_ready");
    expect(assertLearnerSafeCopy(copy)).toEqual([]);
  });

  it("keeps diagnostic copy available in Dev Mode", () => {
    expect(learnerSafeCopy("raw provenance", { devMode: true })).toBe("raw provenance");
  });

  it("maps pipeline status labels for source cards", () => {
    expect(learnerFacingPipelineStatus("tutoring_ready")).toBe("Ready to study");
  });

  it("maps graph node types into product copy", () => {
    expect(learnerFacingNodeTypeLabel("objective_list")).toBe("Session objectives");
    expect(learnerFacingNodeTypeLabel("weak_concept")).toBe("Needs practice");
    expect(learnerFacingNodeTypeLabel("concept")).toBe("concept");
  });

  it("sanitizes nested view-model values", () => {
    const value = learnerSafeValue({
      title: "candidate_claim",
      status: "tutoring_ready",
      nested: ["session_plan", "abc_ref"],
    });
    expect(assertLearnerSafeCopy(value)).toEqual([]);
  });
});
