import { describe, expect, it } from "vitest";
import type { LearningArtifactSection } from "@studyagent/schemas";
import { buildLearningArtifactView } from "./artifact-view.js";

describe("buildLearningArtifactView", () => {
  it("normalizes a worked example into a source-backed learner view", () => {
    const view = buildLearningArtifactView({
      id: "artifact_1",
      notebookId: "nb_1",
      artifactType: "worked_example",
      title: "Fourier law example",
      status: "ready",
      payloadJson: {
        problemStatement: "Find the heat flux through a plane wall.",
        solutionSteps: ["Identify k and dT/dx.", "Apply q'' = -k dT/dx."],
        commonMistakes: ["Dropping the sign convention."],
        finalTakeaway: "Heat flux follows the temperature gradient.",
      },
      sourceNodeRefsJson: [{ refType: "chunk", refId: "chk_1" }],
      sourceClaimIds: ["clm_1"],
      sourceChunkIds: ["chk_1"],
    });

    expect(view.purpose).toContain("solved example");
    expect(view.quality.sourceBacked).toBe(true);
    expect(view.sections.map((section: LearningArtifactSection) => section.id)).toEqual(
      expect.arrayContaining(["problem", "steps", "mistakes", "answer", "evidence"]),
    );
  });

  it("flags placeholder, ungrounded generated content for review", () => {
    const view = buildLearningArtifactView({
      id: "artifact_2",
      notebookId: "nb_1",
      artifactType: "note",
      title: "Placeholder note",
      status: "ready",
      payloadJson: { markdown: "TODO: add real content" },
      sourceNodeRefsJson: [],
      sourceClaimIds: [],
      sourceChunkIds: [],
    });

    expect(view.quality.needsReview).toBe(true);
    expect(view.quality.issues.join(" ")).toMatch(/source support|placeholder/i);
  });
});
