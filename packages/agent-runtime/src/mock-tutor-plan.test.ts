import { describe, expect, it } from "vitest";
import { isGenericTutorIdleReply, planMockTutorSessionSteps } from "./mock-tutor-plan.js";
import type { StudyAgentPromptContext } from "./index.js";

const baseContext: StudyAgentPromptContext = {
  notebookTitle: "Derivatives primer",
  activeMode: "learn",
  selectedNodeRefs: [{ refType: "concept", refId: "concept_derivatives" }],
  currentObjective: "Derivative basics",
};

describe("planMockTutorSessionSteps", () => {
  it("routes quiz requests to artifact.create_quiz", () => {
    const steps = planMockTutorSessionSteps(
      "Can you make me a quiz I can study from?",
      baseContext,
    );
    expect(
      steps.some((step) => step.type === "tool_call" && step.toolName === "artifact.create_quiz"),
    ).toBe(true);
  });

  it("routes remediation corrections to learning.evaluate_response", () => {
    const steps = planMockTutorSessionSteps(
      "I think it is the tangent line, not the secant line, because the limit shrinks to one point. Is that correction right?",
      baseContext,
    );
    expect(
      steps.some(
        (step) => step.type === "tool_call" && step.toolName === "learning.evaluate_response",
      ),
    ).toBe(true);
  });

  it("routes slope misconceptions to a mastery-check question", () => {
    const steps = planMockTutorSessionSteps(
      "I think the rule is about slope, but I may be mixing things up.",
      baseContext,
    );
    const text = steps
      .filter((step) => step.type === "text")
      .map((step) => step.content)
      .join(" ");
    expect(text).toContain("?");
    expect(text.toLowerCase()).toContain("secant");
  });

  it("keeps Fourier's law fallback tutoring on the requested source topic", () => {
    const steps = planMockTutorSessionSteps(
      "Please teach me Fourier's law and explain the negative sign in q = -kA dT/dx.",
      {
        ...baseContext,
        notebookTitle: "Heat transfer",
        selectedNodeRefs: [{ refType: "source", refId: "src_1" }],
      },
    );
    const text = steps
      .filter((step) => step.type === "text")
      .map((step) => step.content)
      .join(" ");
    expect(text.toLowerCase()).toContain("fourier");
    expect(text.toLowerCase()).toContain("negative sign");
    expect(text.toLowerCase()).toContain("heat flows");
    expect(steps.some((step) => step.type === "tool_call" && step.toolName === "wiki.search")).toBe(
      true,
    );
  });

  it("uses grounded context fallback instead of generic idle greeting", () => {
    const steps = planMockTutorSessionSteps("Okay I rushed and missed a detail.", baseContext);
    const text = steps
      .filter((step) => step.type === "text")
      .map((step) => step.content)
      .join(" ");
    expect(isGenericTutorIdleReply(text)).toBe(false);
    expect(
      steps.some((step) => step.type === "tool_call" && step.toolName === "notebook.get_context"),
    ).toBe(true);
  });

  it("routes revision follow-ups to artifact creation", () => {
    const steps = planMockTutorSessionSteps(
      "Please keep it tied to the source and make it useful for revision.",
      baseContext,
    );
    expect(
      steps.some((step) => step.type === "tool_call" && step.toolName === "artifact.create_quiz"),
    ).toBe(true);
  });
});
