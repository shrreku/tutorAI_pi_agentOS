import { describe, expect, it } from "vitest";
import { buildIntentRoutingInstruction, detectLearnerIntent } from "../tutor-intent.js";

describe("tutor intent routing", () => {
  it("detects teach-me opener requests", () => {
    expect(detectLearnerIntent("teach me about vector spaces")).toEqual({
      type: "teach_me",
      keyword: "teach me",
    });
  });

  it("routes teach-me requests to the active objective", () => {
    const instruction = buildIntentRoutingInstruction(
      { type: "teach_me", keyword: "teach me" },
      true,
      "Understand linear combinations",
    );

    expect(instruction).toContain("Begin teaching this objective directly");
    expect(instruction).toContain("Understand linear combinations");
  });

  it("falls back to a cold-start routing question when no objective exists", () => {
    expect(
      buildIntentRoutingInstruction({ type: "teach_me", keyword: "teach me" }, false, undefined),
    ).toBeNull();
  });

  it("keeps help-me requests anchored to the active objective", () => {
    const instruction = buildIntentRoutingInstruction(
      { type: "help_me_with", keyword: "help me with" },
      true,
      "Understand linear combinations",
    );

    expect(instruction).toContain("targeted help on weak concepts");
    expect(instruction).toContain("Understand linear combinations");
  });

  it("detects explore intent for notebook navigation requests", () => {
    expect(detectLearnerIntent("can we explore the map first?")).toEqual({
      type: "explore",
      keyword: "explore",
    });
  });

  it("routes explore intent to objective-grounded overview when objective exists", () => {
    const instruction = buildIntentRoutingInstruction(
      { type: "explore", keyword: "explore" },
      true,
      "Understand linear combinations",
    );
    expect(instruction).toContain("objective-centered map");
    expect(instruction).toContain("Understand linear combinations");
  });
});
