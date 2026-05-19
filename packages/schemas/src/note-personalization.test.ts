import { describe, expect, it } from "vitest";
import {
  mergeNoteArtifactPayload,
  noteArtifactPayloadSchema,
  notePersonalizationMetadataSchema,
} from "./note-personalization.js";

describe("note personalization contracts", () => {
  it("accepts ordinary notes without personalization metadata", () => {
    const parsed = noteArtifactPayloadSchema.parse({
      markdown: "A".repeat(80),
      keyPoints: ["Point one"],
    });
    expect(parsed.personalization).toBeUndefined();
  });

  it("accepts personalized notes with section metadata", () => {
    const parsed = noteArtifactPayloadSchema.parse({
      markdown: "Overview for your session.",
      personalization: {
        whyPersonalized: "Targets weak chain rule after quiz mistakes.",
        weakConceptIds: ["concept_chain"],
        sections: [
          {
            id: "from_source",
            title: "From your source",
            kind: "from_source",
            body: "The chain rule combines derivatives of composed functions.",
            sourceRefs: [{ refType: "chunk", refId: "chk_1" }],
          },
          {
            id: "mistakes",
            title: "For your mistakes",
            kind: "for_mistakes",
            body: "Watch the order: differentiate the outer function first.",
            sourceRefs: [],
          },
        ],
      },
    });
    expect(parsed.personalization?.sections).toHaveLength(2);
  });

  it("preserves personalization metadata when the learner edits markdown", () => {
    const merged = mergeNoteArtifactPayload(
      {
        markdown: "Original",
        personalization: notePersonalizationMetadataSchema.parse({
          sections: [
            {
              id: "mistakes",
              title: "For your mistakes",
              kind: "for_mistakes",
              body: "Remember the outer derivative.",
              sourceRefs: [],
            },
          ],
        }),
      },
      { noteMarkdown: "Edited overview by learner." },
    );
    expect(merged.markdown).toBe("Edited overview by learner.");
    expect((merged.personalization as { sections: unknown[] }).sections).toHaveLength(1);
  });

  it("clears personalization when requested", () => {
    const merged = mergeNoteArtifactPayload(
      { markdown: "Original", personalization: { sections: [] } },
      { clearPersonalization: true },
    );
    expect(merged.personalization).toBeUndefined();
  });
});
