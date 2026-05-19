import { describe, expect, it } from "vitest";
import { buildLearningArtifactView } from "./artifact-view.js";
import { decideArtifactQuality } from "./artifact-lifecycle.js";

const LONG_NOTE = "A".repeat(420);

describe("personalized note rendering and quality", () => {
  it("renders an ordinary note without personalized sections", () => {
    const view = buildLearningArtifactView({
      id: "note_1",
      notebookId: "nb_1",
      artifactType: "note",
      title: "Study note",
      status: "ready",
      payloadJson: { markdown: LONG_NOTE, keyPoints: ["Key point"] },
      sourceNodeRefsJson: [{ refType: "chunk", refId: "chk_1" }],
      sourceClaimIds: [],
      sourceChunkIds: ["chk_1"],
    });
    expect(view.sections.some((section) => section.title === "From your source")).toBe(false);
    expect(view.quality.sourceBacked).toBe(true);
  });

  it("renders personalized sections for learner-safe note views", () => {
    const view = buildLearningArtifactView({
      id: "note_2",
      notebookId: "nb_1",
      artifactType: "note",
      title: "Personalized note",
      status: "ready",
      payloadJson: {
        markdown: "Session overview.",
        personalization: {
          sections: [
            {
              id: "source",
              title: "From your source",
              kind: "from_source",
              body: "Heat flows from hot to cold regions.",
              sourceRefs: [{ refType: "chunk", refId: "chk_1" }],
            },
            {
              id: "mistakes",
              title: "For your mistakes",
              kind: "for_mistakes",
              body: "Do not flip the sign when integrating.",
              sourceRefs: [],
            },
          ],
        },
      },
      sourceNodeRefsJson: [{ refType: "chunk", refId: "chk_1" }],
      sourceClaimIds: [],
      sourceChunkIds: ["chk_1"],
    });
    expect(view.sections.some((section) => section.title === "From your source")).toBe(true);
    expect(view.sections.some((section) => section.title === "For your mistakes")).toBe(true);
  });

  it("passes quality gates for personalized notes with section bodies", () => {
    const quality = decideArtifactQuality({
      artifactType: "note",
      status: "ready",
      payload: {
        markdown: "Short overview.",
        personalization: {
          sections: [{ id: "s1", title: "For your mistakes", kind: "for_mistakes", body: "Review sign errors." }],
        },
      },
      sourceRefs: [{ refType: "chunk", refId: "chk_1" }],
    });
    expect(quality.canBecomeReady).toBe(true);
  });

  it("flags personalized notes that lack evidence and section bodies", () => {
    const quality = decideArtifactQuality({
      artifactType: "note",
      status: "ready",
      payload: {
        markdown: "",
        personalization: { sections: [] },
      },
      sourceRefs: [],
    });
    expect(quality.canBecomeReady).toBe(false);
    expect(quality.issues.join(" ")).toMatch(/overview|source support/i);
  });
});
