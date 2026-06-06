import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notebooks, sources } from "@studyagent/db";
import type { AppContext } from "../context.js";
import { registerSourceRoutes } from "./sources.js";

vi.mock("../auth.js", () => ({
  resolveActor: vi.fn(async () => ({ id: "user_1" })),
}));

function createFakeDb() {
  return {
    select() {
      return {
        from(table: unknown) {
          return {
            where(_condition: unknown) {
              if (table === sources) {
                return {
                  orderBy(_order: unknown) {
                    return Promise.resolve([
                      {
                        id: "src_1",
                        notebookId: "nb_1",
                        title: "Chapter 1",
                        status: "tutoring_ready",
                        metadataJson: {},
                      },
                    ]);
                  },
                };
              }
              return {
                orderBy(_order: unknown) {
                  return Promise.resolve([]);
                },
                limit(limitCount: number) {
                  if (table === notebooks) {
                    return Promise.resolve([{ id: "nb_1", ownerId: "user_1", title: "Notebook" }].slice(0, limitCount));
                  }
                  return Promise.resolve([]);
                },
              };
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
    },
  };
}

describe("source routes", () => {
  let app = Fastify();

  beforeEach(async () => {
    app = Fastify();
    await registerSourceRoutes(app, {
      db: { db: createFakeDb() },
      env: {},
      s3: null,
      ingestionQueue: null,
    } as unknown as AppContext);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns learner-facing source views instead of raw pipeline rows", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/notebooks/nb_1/sources",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      sources: Array<{ learnerLabel: string; tutoringReady: boolean; readiness: unknown }>;
    };
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]?.learnerLabel).toBe("Ready");
    expect(body.sources[0]?.tutoringReady).toBe(true);
    expect(body.sources[0]?.readiness).toBeTruthy();
    expect(body.sources[0]).not.toHaveProperty("status");
  });

  it("returns split readiness when metadata has tutor-ready but wiki and projection pending", async () => {
    const readiness = {
      retrieval: { ready: true, status: "ready", updatedAt: null, message: null },
      search: { ready: true, status: "ready", updatedAt: null, message: null },
      tutoring: { ready: true, status: "ready", updatedAt: null, message: null },
      wiki: { ready: false, status: "pending", updatedAt: null, message: null },
      planning: { ready: false, status: "pending", updatedAt: null, message: null },
      projection: { ready: false, status: "pending", updatedAt: null, message: null },
      learnerSourceWiki: { ready: false, status: "pending", updatedAt: null, message: null },
    };
    const appWithSplit = Fastify();
    await registerSourceRoutes(appWithSplit, {
      db: {
        db: {
          select() {
            return {
              from(table: unknown) {
                return {
                  where(_condition: unknown) {
                    if (table === sources) {
                      return {
                        orderBy(_order: unknown) {
                          return Promise.resolve([
                            {
                              id: "src_split",
                              notebookId: "nb_1",
                              title: "Chapter 1",
                              status: "tutoring_ready",
                              metadataJson: { sourceReadiness: readiness },
                            },
                          ]);
                        },
                      };
                    }
                    return {
                      orderBy(_order: unknown) {
                        return Promise.resolve([]);
                      },
                      limit(limitCount: number) {
                        if (table === notebooks) {
                          return Promise.resolve([{ id: "nb_1", ownerId: "user_1", title: "Notebook" }].slice(0, limitCount));
                        }
                        return Promise.resolve([]);
                      },
                    };
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
          },
        },
      },
      env: {},
      s3: null,
      ingestionQueue: null,
    } as unknown as AppContext);

    const response = await appWithSplit.inject({
      method: "GET",
      url: "/notebooks/nb_1/sources",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      sources: Array<{ learnerLabel: string; tutoringReady: boolean; sourceWikiReady: boolean; readiness: Record<string, unknown> }>;
    };
    expect(body.sources[0]?.tutoringReady).toBe(true);
    expect(body.sources[0]?.sourceWikiReady).toBe(false);
    expect(body.sources[0]?.learnerLabel).toBe("Ready for tutoring; Source Wiki still improving");
    expect(body.sources[0]?.readiness).toMatchObject({ tutoring: { ready: true }, projection: { ready: false } });
    await appWithSplit.close();
  });
});
