import { describe, expect, it } from "vitest";
import {
  normalizePersonalizationPreferenceValue,
  personalizationPatchFromAction,
} from "./interactive-learning-personalization.js";

describe("interactive learning personalization", () => {
  it("normalizes learner-facing pace labels to trait vocabulary", () => {
    expect(normalizePersonalizationPreferenceValue("pace", "slower")).toBe("slow");
    expect(normalizePersonalizationPreferenceValue("depth", "deep")).toBe("formal");
    expect(normalizePersonalizationPreferenceValue("examples", "more")).toBe("visual");
    expect(normalizePersonalizationPreferenceValue("assessment", "light")).toBe("checkpoint");
  });

  it("maps pace preference updates to student profile patches", () => {
    expect(personalizationPatchFromAction({ preference: "pace", value: "slower" })).toEqual({
      pacePreference: "slow",
    });
  });

  it("maps examples preference updates to examplePreferencesJson", () => {
    expect(personalizationPatchFromAction({ preference: "examples", value: "more" })).toEqual({
      examplePreferencesJson: { preference: "visual" },
    });
  });
});
