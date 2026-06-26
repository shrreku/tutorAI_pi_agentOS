import { describe, expect, it } from "vitest";
import {
  conceptPageKey,
  loadTopicPagesForObjectiveConcepts,
  normalizeTopicKey,
  resolveCanonicalTopicPageKey,
  resolveTopicPageKey,
  shouldMergeTopics,
  topicPageBelongsToSource,
} from "./topic-concept-resolution.js";

describe("normalizeTopicKey", () => {
  it("normalizes titles for stable keys", () => {
    expect(normalizeTopicKey("Heat Transfer")).toBe("heat_transfer");
    expect(normalizeTopicKey("  Laws of Thermodynamics ")).toBe("laws_of_thermodynamics");
  });
});

describe("resolveTopicPageKey", () => {
  it("returns a notebook-global topic page key", () => {
    expect(
      resolveTopicPageKey({
        notebookId: "nb_1",
        topicTitle: "Entropy and Disorder",
      }),
    ).toBe("topic:entropy_and_disorder");
  });

  it("uses heading path context without changing the normalized title key", () => {
    expect(
      resolveTopicPageKey({
        notebookId: "nb_1",
        topicTitle: "Second Law",
        sourceHeadingPath: ["Thermodynamics", "Second Law"],
        objectiveId: "obj_1",
      }),
    ).toBe("topic:second_law");
  });
});

describe("shouldMergeTopics", () => {
  it("merges alias and singular/plural variants", () => {
    expect(
      shouldMergeTopics(
        { title: "Heat Transfer", aliases: ["heat transfers"] },
        { title: "Heat Transfers" },
      ),
    ).toBe(true);
  });

  it("merges source-heading topics with curriculum topics", () => {
    expect(
      shouldMergeTopics(
        { title: "Thermodynamics", sourceHeadingPath: ["Chapter 1", "Second Law"] },
        { title: "Second Law", objectiveIds: ["obj_2"] },
      ),
    ).toBe(true);
  });

  it("merges topics with shared objectives", () => {
    expect(
      shouldMergeTopics(
        { title: "Entropy", objectiveIds: ["obj_1", "obj_2"] },
        { title: "Disorder", objectiveIds: ["obj_2", "obj_3"] },
      ),
    ).toBe(true);
  });

  it("does not merge unrelated topics", () => {
    expect(
      shouldMergeTopics(
        { title: "Calculus", conceptIds: ["cpt_1"] },
        { title: "Thermodynamics", conceptIds: ["cpt_9"] },
      ),
    ).toBe(false);
  });
});

describe("conceptPageKey", () => {
  it("uses stable concept ids", () => {
    expect(conceptPageKey("cpt_entropy")).toBe("concept:cpt_entropy");
  });
});

describe("resolveCanonicalTopicPageKey", () => {
  it("reuses an existing merged topic page key", () => {
    const resolved = resolveCanonicalTopicPageKey({
      topicTitle: "Heat Transfer",
      existingTopicPages: [{ pageKey: "topic:heat_transfer", title: "Topic · Heat Transfers" }],
    });
    expect(resolved.pageKey).toBe("topic:heat_transfer");
  });

  it("migrates legacy source topic keys to normalized keys", () => {
    const resolved = resolveCanonicalTopicPageKey({
      topicTitle: "Thermodynamics Notes",
      sourceId: "src_1",
      existingTopicPages: [{ pageKey: "topic:src_1", title: "Topic · Thermodynamics Notes" }],
    });
    expect(resolved.pageKey).toBe("topic:thermodynamics_notes");
    expect(resolved.legacyPageKeysToRetire).toContain("topic:src_1");
  });
});

describe("loadTopicPagesForObjectiveConcepts", () => {
  it("matches topic pages by linked concept ids", () => {
    const matches = loadTopicPagesForObjectiveConcepts({
      topicPages: [
        {
          id: "wp_topic_1",
          pageKey: "topic:heat_transfer",
          title: "Topic · Heat Transfer",
          structuredJson: { conceptIds: ["cnc_1"] },
        },
      ],
      conceptRows: [{ id: "cnc_1", canonicalName: "Conduction" }],
      objectiveConceptIds: ["cnc_1"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.pageKey).toBe("topic:heat_transfer");
  });
});

describe("topicPageBelongsToSource", () => {
  it("matches legacy and normalized topic pages", () => {
    expect(topicPageBelongsToSource({ pageKey: "topic:src_1", title: "Topic" }, "src_1")).toBe(
      true,
    );
    expect(
      topicPageBelongsToSource(
        {
          pageKey: "topic:heat_transfer",
          title: "Topic",
          structuredJson: { bootstrapSourceId: "src_1" },
        },
        "src_1",
      ),
    ).toBe(true);
  });
});
