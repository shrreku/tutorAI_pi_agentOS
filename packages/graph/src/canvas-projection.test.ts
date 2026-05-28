import { describe, expect, it } from "vitest";
import { buildSourceWikiTopicProjection, normalizeNeo4jCanvasEdges, normalizeNeo4jCanvasNodes } from "./canvas-projection.js";

describe("canvas graph projection", () => {
  it("normalizes Neo4j records into canvas records", () => {
    const nodes = normalizeNeo4jCanvasNodes([
      { id: "concept_1", labels: ["Concept"], props: { title: "Vectors" } },
      { id: "page_1", labels: ["WikiPage"], props: { title: "Vector page" } },
    ]);
    const edges = normalizeNeo4jCanvasEdges(
      [{ startId: "source_1", endId: "concept_1", type: "COVERS", props: { confidence: 0.8 } }],
      new Set(["source_1", "concept_1"]),
    );

    expect(nodes).toEqual([
      { id: "concept_1", nodeType: "concept", labels: ["Concept"], properties: { title: "Vectors" } },
      { id: "page_1", nodeType: "wiki_page", labels: ["WikiPage"], properties: { title: "Vector page" } },
    ]);
    expect(edges).toEqual([
      {
        id: "source_1-concept_1-COVERS-0",
        source: "source_1",
        target: "concept_1",
        relationType: "COVERS",
        properties: { confidence: 0.8, learnerLabel: "covers" },
      },
    ]);
  });

  it("projects source wiki topics as shared graph package behavior", () => {
    const projected = buildSourceWikiTopicProjection({
      notebookId: "nb_1",
      sourceId: "src_1",
      nodes: [
        { id: "src_1", nodeType: "source", labels: ["Source"], properties: { title: "Lecture" } },
        { id: "topic_src_1_probability", nodeType: "topic", labels: ["Topic"], properties: { title: "Probability", sourceId: "src_1" } },
        { id: "concept_1", nodeType: "concept", labels: ["Concept"], properties: { headingPath: ["Probability"] } },
        { id: "page_1", nodeType: "wiki_page", labels: ["WikiPage"], properties: { headingPath: ["Probability"] } },
        { id: "topic_page_1", nodeType: "wiki_page", labels: ["WikiPage"], properties: { pageType: "topic", title: "Probability", sourceId: "src_1" } },
      ],
      edges: [
        { id: "e1", source: "topic_src_1_probability", target: "topic_page_1", relationType: "CONTAINS_PAGE", properties: {} },
        { id: "e2", source: "topic_src_1_probability", target: "concept_1", relationType: "CONTAINS_CONCEPT", properties: {} },
        { id: "e3", source: "topic_src_1_probability", target: "page_1", relationType: "CONTAINS_PAGE", properties: {} },
      ],
    });

    expect(projected.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "topic_src_1_probability", nodeType: "topic" }),
        expect.objectContaining({ id: "topic_page_1", nodeType: "wiki_page", properties: expect.objectContaining({ pageType: "topic" }) }),
      ]),
    );
    expect(projected.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "src_1", target: "topic_page_1", relationType: "HAS_TOPIC" }),
        expect.objectContaining({ source: "topic_page_1", target: "concept_1", relationType: "CONTAINS_CONCEPT" }),
        expect.objectContaining({ source: "topic_page_1", target: "page_1", relationType: "CONTAINS_PAGE" }),
      ]),
    );
  });
});
