import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimConceptLinks, claims, concepts, wikiPages } from "@studyagent/db";
import type { AppContext } from "./context.js";
const { enqueueGenerationJob } = vi.hoisted(() => ({
  enqueueGenerationJob: vi.fn(async () => ({ id: "gjob_touch" })),
}));

vi.mock("@studyagent/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@studyagent/db")>();
  return {
    ...actual,
    enqueueGenerationJob,
  };
});

import { ensureConceptPage, ensureTopicPage, touchConceptPage, touchTopicPage } from "./wiki-touch-service.js";

vi.mock("./agentic-cache-invalidation.js", () => ({
  appendEventWithTutorCacheInvalidation: vi.fn(async () => ({ id: "evt_1", sequenceNo: 1 })),
}));

vi.mock("./reference-surface.js", () => ({
  buildReferenceSurface: vi.fn(async () => ({
    id: "surface_wp",
    notebookId: "nb_1",
    nodeRef: { refType: "wiki_page", refId: "wp_1" },
    title: "Wiki page",
    surfaceType: "wiki_page",
    summary: null,
    status: "draft",
    blocks: [],
    interactiveBlocks: [],
    scopeRefs: [],
    sourceRefs: [],
    provenanceRefs: [],
    coverageRefs: [],
    primaryActions: ["ask_tutor"],
    quality: { confidence: null, sourceBacked: false, needsReview: false },
  })),
  toLearnerFacingReferenceSurface: (surface: unknown) => surface,
}));

type Row = Record<string, unknown>;

class WikiTouchFakeDb {
  concepts: Row[] = [];
  wikiPages: Row[] = [];
  claims: Row[] = [];
  claimConceptLinks: Row[] = [];

  select(_selection?: unknown) {
    const db = this;
    return {
      from(table: unknown) {
        return {
          where(_condition: unknown) {
            return {
              limit(limitCount: number) {
                const rows = db.tableRows(table);
                return Promise.resolve(rows.slice(0, limitCount));
              },
              orderBy(_order: unknown) {
                return {
                  limit(limitCount: number) {
                    const rows = db.tableRows(table);
                    return Promise.resolve(rows.slice(0, limitCount));
                  },
                };
              },
              then<TResult1 = Row[]>(
                onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult1 | PromiseLike<TResult1>) | null,
              ) {
                return Promise.resolve(db.tableRows(table)).then(onfulfilled, onrejected);
              },
            };
          },
        };
      },
    };
  }

  insert(table: unknown) {
    const db = this;
    return {
      values: async (row: Row) => {
        if (table === wikiPages) db.wikiPages.push(row);
      },
    };
  }

  update(table: unknown) {
    const db = this;
    return {
      set: (patch: Row) => ({
        where: async (_condition: unknown) => {
          if (table === wikiPages && db.wikiPages[0]) {
            db.wikiPages[0] = { ...db.wikiPages[0], ...patch };
          }
        },
      }),
    };
  }

  private tableRows(table: unknown): Row[] {
    if (table === concepts) return this.concepts;
    if (table === wikiPages) return this.wikiPages;
    if (table === claims) return this.claims;
    if (table === claimConceptLinks) return this.claimConceptLinks;
    return [];
  }
}

function ctxFor(db: WikiTouchFakeDb): AppContext {
  return { env: {}, db: { db } } as unknown as AppContext;
}

describe("wiki touch service", () => {
  beforeEach(() => {
    enqueueGenerationJob.mockClear();
  });

  it("creates a missing concept page heuristically", async () => {
    const db = new WikiTouchFakeDb();
    db.concepts.push({ id: "cpt_1", notebookId: "nb_1", canonicalName: "Entropy" });

    const result = await ensureConceptPage(ctxFor(db), {
      notebookId: "nb_1",
      conceptId: "cpt_1",
    });

    expect(result.pageRef.refType).toBe("wiki_page");
    expect(result.status).toBe("heuristic");
    expect(db.wikiPages).toHaveLength(1);
    expect(db.wikiPages[0]?.pageKey).toBe("concept:cpt_1");
  });

  it("creates a missing topic page but concept ensure rejects topic shells", async () => {
    const db = new WikiTouchFakeDb();

    const topic = await ensureTopicPage(ctxFor(db), {
      notebookId: "nb_1",
      title: "Thermodynamics",
    });
    expect(topic.status).toBe("heuristic");
    expect(db.wikiPages[0]?.pageType).toBe("topic");

    await expect(
      ensureConceptPage(ctxFor(db), {
        notebookId: "nb_1",
        conceptId: "cpt_1",
        createTopicShells: true,
      }),
    ).rejects.toThrow(/cannot create topic page shells/i);
  });

  it("completes touch within the foreground budget", async () => {
    const db = new WikiTouchFakeDb();
    db.concepts.push({ id: "cpt_1", notebookId: "nb_1", canonicalName: "Entropy" });
    db.wikiPages.push({
      id: "wp_existing",
      notebookId: "nb_1",
      pageType: "concept",
      pageKey: "concept:cpt_1",
      title: "Concept · Entropy",
      version: 1,
      status: "draft",
      markdown: "# Entropy",
      structuredJson: { conceptId: "cpt_1", pageReadiness: "still_improving" },
      sourceClaimIds: [],
      sourceChunkIds: [],
      qualityScore: 0.4,
    });

    const result = await touchConceptPage(
      ctxFor(db),
      { notebookId: "nb_1", conceptId: "cpt_1", foregroundBudgetMs: 50 },
      {
        executePolish: async (_env, _dbClient, target) => {
          const page = db.wikiPages.find((row) => row.id === target.pageId);
          if (page) {
            page.structuredJson = { ...(page.structuredJson as object), pageReadiness: "ready_to_study" };
            page.markdown = "# Entropy\n\n## Definition\nPolished.";
          }
          return {
            ok: true,
            pageId: target.pageId,
            pageKey: target.pageKey,
            applied: true,
            fallbackUsed: false,
            pageReadiness: "ready_to_study",
            learnerStatusLabel: "Ready to study",
            qualityIssues: [],
          };
        },
        sleep: async () => undefined,
      },
    );

    expect(result.foregroundCompleted).toBe(true);
    expect(result.backgroundContinues).toBe(false);
    expect(result.readiness).toBe("ready_to_study");
  });

  it("continues in the background after foreground timeout", async () => {
    const db = new WikiTouchFakeDb();
    db.concepts.push({ id: "cpt_2", notebookId: "nb_1", canonicalName: "Heat" });
    db.wikiPages.push({
      id: "wp_timeout",
      notebookId: "nb_1",
      pageType: "concept",
      pageKey: "concept:cpt_2",
      title: "Concept · Heat",
      version: 1,
      status: "draft",
      markdown: "# Heat",
      structuredJson: { conceptId: "cpt_2", pageReadiness: "still_improving" },
      sourceClaimIds: [],
      sourceChunkIds: [],
      qualityScore: 0.35,
    });

    let resolvePolish!: () => void;
    const polishPromise = new Promise<void>((resolve) => {
      resolvePolish = resolve;
    });

    const result = await touchConceptPage(
      ctxFor(db),
      { notebookId: "nb_1", conceptId: "cpt_2", foregroundBudgetMs: 1 },
      {
        executePolish: async () => {
          await polishPromise;
          return {
            ok: true,
            pageId: "wp_timeout",
            pageKey: "concept:cpt_2",
            applied: true,
            fallbackUsed: false,
            pageReadiness: "ready_to_study",
            learnerStatusLabel: "Ready to study",
            qualityIssues: [],
          };
        },
        sleep: async (ms: number) => {
          await new Promise((resolve) => setTimeout(resolve, ms));
        },
      },
    );

    expect(result.backgroundContinues).toBe(true);
    expect(result.foregroundCompleted).toBe(false);
    expect(result.status).toBe("polishing");
    expect(db.wikiPages[0]?.structuredJson).toMatchObject({ backgroundPolishStatus: "pending" });
    expect(enqueueGenerationJob).toHaveBeenCalled();

    resolvePolish();
  });
});
