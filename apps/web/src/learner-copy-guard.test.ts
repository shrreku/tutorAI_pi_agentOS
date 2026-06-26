import { describe, expect, it } from "vitest";
import {
  assertLearnerSafeCopy,
  learnerFacingPipelineStatus,
  learnerSafeCopy,
} from "@studyagent/schemas";

describe("learner copy guard", () => {
  it("maps raw pipeline vocabulary into product copy", () => {
    const copy = learnerSafeCopy(
      "source is tutoring_ready with objective_list and session_plan refs",
    );
    expect(copy).toContain("Ready to study");
    expect(copy).toContain("session objectives");
    expect(copy).not.toContain("tutoring_ready");
    expect(assertLearnerSafeCopy(copy)).toEqual([]);
  });

  it("maps pipeline status labels for source cards", () => {
    expect(learnerFacingPipelineStatus("tutoring_ready")).toBe("Ready to study");
    expect(assertLearnerSafeCopy(learnerFacingPipelineStatus("tutoring_ready"))).toEqual([]);
  });

  it("keeps diagnostic copy available in Dev Mode", () => {
    expect(learnerSafeCopy("raw provenance", { devMode: true })).toBe("raw provenance");
  });

  it("detects forbidden terms before they reach learner surfaces", () => {
    expect(assertLearnerSafeCopy({ title: "candidate_claim", status: "tutoring_ready" })).toEqual([
      "candidate_claim",
      "tutoring_ready",
    ]);
  });
});
