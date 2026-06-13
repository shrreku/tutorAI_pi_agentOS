import { describe, expect, it } from "vitest";
import type { ReferenceSurface } from "@studyagent/schemas";
import { artifactSurfaceActionIds, buildArtifactReviewView, visibleReferenceBlocks } from "./artifact-review.js";

describe("buildArtifactReviewView", () => {
  it("derives quiz practice actions and learner-safe status", () => {
    expect(buildArtifactReviewView({
      id: "artifact_1",
      title: "Quiz",
      artifactType: "quiz",
      status: "ready",
      view: { confidence: 0.9, quality: { sourceBacked: true, needsReview: false, issues: [] } },
    })).toMatchObject({
      statusLabel: "Ready to study",
      qualityLabel: "Ready",
      actions: ["practice", "ask_tutor"],
    });
  });

  it("keeps approval actions consistent for proposed artifacts", () => {
    expect(buildArtifactReviewView({
      id: "artifact_2",
      title: "Draft note",
      artifactType: "note",
      status: "proposed",
      view: { confidence: null, quality: { sourceBacked: false, needsReview: true, issues: ["Needs citations"] } },
    }).actions).toEqual(["approve", "reject", "review", "ask_tutor", "save"]);
  });

  it("matches Reference Surface action families for artifact types", () => {
    expect(artifactSurfaceActionIds({ id: "quiz_1", title: "Quiz", artifactType: "quiz", status: "ready" })).toEqual([
      "ask_tutor",
      "quiz",
      "regenerate",
      "open_evidence",
    ]);
    expect(artifactSurfaceActionIds({ id: "note_1", title: "Note", artifactType: "note", status: "ready" })).toEqual([
      "ask_tutor",
      "review",
      "regenerate",
      "open_evidence",
    ]);
  });
});

describe("visibleReferenceBlocks", () => {
  it("hides native quiz practice blocks when an interactive quiz block is present", () => {
    const surface = {
      surfaceType: "artifact",
      blocks: [
        { id: "artifact_summary", kind: "summary", title: "Overview", content: "Practice" },
        { id: "questions", kind: "question_list", title: "Questions", content: [{ id: "q1", prompt: "?" }] },
      ],
      interactiveBlocks: [{ id: "interactive_quiz_1", kind: "quiz", title: "Quiz" }],
    } as unknown as ReferenceSurface;

    expect(visibleReferenceBlocks(surface).map((block) => block.kind)).toEqual(["summary"]);
  });
});
