import { describe, expect, it } from "vitest";
import type { ReferenceSurface } from "@studyagent/schemas";
import { mapLearnerPrimaryActions } from "@studyagent/schemas";
import { buildTutorPanelArtifactReview } from "./artifact-review.js";
import { normalizeAssistantMessageText } from "./TutorPanel.js";

const quizSurface: ReferenceSurface = {
  id: "surface_quiz",
  notebookId: "nb_1",
  nodeRef: { refType: "artifact", refId: "artifact_quiz" },
  title: "Quiz",
  surfaceType: "artifact",
  summary: null,
  status: "ready",
  blocks: [{
    id: "questions",
    kind: "question_list",
    title: "Questions",
    content: [{ id: "q1", prompt: "What is x?", choices: ["x", "y"], answer: "x" }],
    evidenceRefs: [],
  }],
  scopeRefs: [],
  sourceRefs: [],
  provenanceRefs: [],
  coverageRefs: [],
  primaryActions: ["ask_tutor", "quiz", "regenerate", "open_evidence"],
  quality: { confidence: 0.9, sourceBacked: true, needsReview: false },
};

describe("TutorPanel artifact review", () => {
  it("derives tutor panel actions from the server reference surface when available", () => {
    const review = buildTutorPanelArtifactReview({
      id: "artifact_quiz",
      title: "Quiz",
      artifactType: "quiz",
      status: "ready",
      view: { confidence: 0.9, quality: { sourceBacked: true, needsReview: false, issues: [] } },
    }, quizSurface);

    expect(review.actions).toEqual(expect.arrayContaining(["practice", "ask_tutor"]));
    expect(review.actions).not.toContain("review");
  });

  it("maps learner-facing primary actions away from provenance vocabulary", () => {
    expect(mapLearnerPrimaryActions(["ask_tutor", "open_provenance"])).toEqual(["ask_tutor", "open_evidence"]);
  });

  it("normalizes assistant markdown without exposing internal ids", () => {
    const normalized = normalizeAssistantMessageText(
      'msg_123 Your quiz is created | # Question | Difficulty | --- | --- | Q1 | Easy | Q2 | Medium',
    );

    expect(normalized).not.toContain("msg_123");
    expect(normalized).toContain("| Question | Difficulty |");
    expect(normalized).toContain("\n| --- | --- |");
    expect(normalized).toContain("\n| Q1 | Easy |");
  });
});
