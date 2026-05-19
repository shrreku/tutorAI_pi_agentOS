import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notebooks } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { registerGraphRoutes } from "./graph.js";

const { querySourceWikiMapSimpleMock } = vi.hoisted(() => ({
  querySourceWikiMapSimpleMock: vi.fn(),
}));

vi.mock("../auth.js", () => ({
  resolveActor: vi.fn(async () => ({ id: "user_1" })),
}));

vi.mock("@studyagent/graph", async () => {
  const actual = await vi.importActual<typeof import("@studyagent/graph")>("@studyagent/graph");
  const healthyProjection = {
    status: "healthy" as const,
    lagSeconds: 0,
    lastProjectedAt: null,
    lastFailureAt: null,
    failureReason: null,
    learnerWarning: null,
    developerDetail: null,
  };
  return {
    ...actual,
    createNeo4jDriver: vi.fn(() => ({
      session: () => ({}),
      close: vi.fn(async () => {}),
    })),
    querySourceWikiMapSimple: querySourceWikiMapSimpleMock,
    loadNotebookProjectionHealth: vi.fn(async (_db, notebookId: string, devMode: boolean) => ({
      scope: "notebook" as const,
      notebookId,
      ...healthyProjection,
      developerDetail: devMode ? "mock notebook projection" : null,
    })),
    loadSourceProjectionHealth: vi.fn(async (_db, notebookId: string, sourceId: string, devMode: boolean) => ({
      scope: "source" as const,
      notebookId,
      sourceId,
      ...healthyProjection,
      developerDetail: devMode ? "mock source projection" : null,
    })),
  };
});

class FakeDb {
  select() {
    return {
      from(table: unknown) {
        return {
          where(_condition: unknown) {
            return this;
          },
          limit(limitCount: number) {
            if (table === notebooks) {
              return Promise.resolve([{ id: "nb_1", ownerId: "user_1", title: "Notebook" }].slice(0, limitCount));
            }
            return Promise.resolve([]);
          },
        };
      },
    };
  }
}

describe("graph routes", () => {
  let app = Fastify();

  beforeEach(async () => {
    querySourceWikiMapSimpleMock.mockResolvedValue({
      nodes: [
        { id: "src_1", labels: ["Source"], props: { title: "Source One" } },
        { id: "topic_src_1_kinematics", labels: ["Topic"], props: { title: "Kinematics", sourceId: "src_1" } },
        { id: "concept_1", labels: ["Concept"], props: { title: "Concept A", headingPath: ["Kinematics"] } },
        { id: "page_1", labels: ["Wiki_Page"], props: { title: "Page A", headingPath: ["Kinematics"] } },
      ],
      edges: [
        { type: "HAS_TOPIC", startId: "src_1", endId: "topic_src_1_kinematics", props: {} },
        { type: "CONTAINS_CONCEPT", startId: "topic_src_1_kinematics", endId: "concept_1", props: {} },
        { type: "CONTAINS_PAGE", startId: "topic_src_1_kinematics", endId: "page_1", props: {} },
        { type: "EXPLAINS", startId: "concept_1", endId: "page_1", props: {} },
      ],
    });

    const ctx = {
      db: { db: new FakeDb() },
      env: {
        NEO4J_URI: "bolt://neo4j",
        NEO4J_USERNAME: "neo4j",
        NEO4J_PASSWORD: "pass",
      },
    } as unknown as AppContext;

    app = Fastify();
    await registerGraphRoutes(app, ctx);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns projected topic nodes and edges for source wiki map", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb_1/graph/query",
      payload: {
        name: "source_wiki_map",
        sourceId: "src_1",
        limit: 20,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      nodes: Array<{ id: string; nodeType: string }>;
      edges: Array<{ relationType: string; source: string; target: string }>;
      readModel: {
        viewMode: string;
        topics: Array<{ id: string; title: string; conceptIds: string[]; pageIds: string[] }>;
        nodeCatalog: Array<{ visibility: string; referenceSurfaceTarget: unknown }>;
      };
    };
    const topicNode = body.nodes.find((node) => node.nodeType === "topic");
    expect(topicNode).toBeDefined();
    expect(body.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationType: "HAS_TOPIC", source: "src_1" }),
        expect.objectContaining({ relationType: "CONTAINS_CONCEPT", target: "concept_1" }),
        expect.objectContaining({ relationType: "CONTAINS_PAGE", target: "page_1" }),
      ]),
    );
    expect(body.readModel.viewMode).toBe("source_wiki_map");
    expect(body.readModel.topics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Kinematics",
          conceptIds: ["concept_1"],
          pageIds: ["page_1"],
        }),
      ]),
    );
    expect(body.readModel.nodeCatalog.some((entry) => entry.referenceSurfaceTarget)).toBe(true);
  });
});
