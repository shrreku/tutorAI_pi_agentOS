import { describe, expect, it } from "vitest";
import {
  buildConceptLearnerReadiness,
  buildSelfReportedLearnerReadiness,
  inferSourceLevelFromSignals,
  masteryScoreToReadiness,
  parseSourceLevel,
} from "./learning-levels.js";

describe("learning level contracts", () => {
  it("parses known source levels and falls back to unknown", () => {
    expect(parseSourceLevel("undergraduate")).toBe("undergraduate");
    expect(parseSourceLevel("not_a_level")).toBe("unknown");
  });

  it("infers source level from title and profile signals", () => {
    expect(inferSourceLevelFromSignals({ title: "Graduate thermodynamics seminar" }).level).toBe("graduate");
    expect(inferSourceLevelFromSignals({ title: "High school physics notes" }).level).toBe("high_school");
    expect(inferSourceLevelFromSignals({ title: "Random notes" }).level).toBe("unknown");
  });

  it("prefers stored source metadata over heuristics", () => {
    expect(
      inferSourceLevelFromSignals({
        title: "High school physics",
        metadata: { sourceLevel: "professional", sourceId: "src_1" },
      }).level,
    ).toBe("professional");
  });

  it("maps mastery scores to learner readiness", () => {
    expect(masteryScoreToReadiness(0.2)).toBe("foundational");
    expect(masteryScoreToReadiness(0.5)).toBe("developing");
    expect(masteryScoreToReadiness(0.75)).toBe("proficient");
    expect(masteryScoreToReadiness(0.9)).toBe("advanced");
  });

  it("builds concept-specific learner readiness from mastery", () => {
    const readiness = buildConceptLearnerReadiness({
      conceptId: "concept_1",
      masteryScore: 0.42,
      confidence: 0.8,
    });
    expect(readiness.targetRef).toEqual({ refType: "concept", refId: "concept_1" });
    expect(readiness.readiness).toBe("developing");
    expect(readiness.evidenceRefs[0]?.refType).toBe("learning_state");
  });

  it("builds self-reported readiness from profile background", () => {
    const readiness = buildSelfReportedLearnerReadiness({
      backgroundSummary: "I am a first-year undergraduate student.",
      profileId: "profile_1",
    });
    expect(readiness?.inferredLevel).toBe("undergraduate");
    expect(readiness?.evidenceRefs[0]?.refType).toBe("self_report");
  });
});
