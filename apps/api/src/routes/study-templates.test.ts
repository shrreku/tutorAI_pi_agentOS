import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studyTemplates } from "@studyagent/db";
import type { AppContext } from "../context.js";
import {
  isLearnerVisibleTemplate,
  isTemplateContentReady,
  isTemplateAccessibleToLearner,
  isSourceRightsReviewed,
  isTemplateReadinessComplete,
  missingTemplateReadinessRequirements,
  registerStudyTemplateRoutes,
  type TemplateReadinessAudit,
  toTemplateSummary,
} from "./study-templates.js";

vi.mock("../hosted-beta/entitlements.js", () => ({
  requireAdminAccess: vi.fn(async () => ({
    actor: { id: "usr_admin", email: "admin@studyagent.local" },
  })),
  sendAuthOrEntitlementError: vi.fn((reply, error) => {
    const statusCode = typeof error?.statusCode === "number" ? error.statusCode : 500;
    return reply.status(statusCode).send({
      code: error?.code ?? "error",
      message: error?.message ?? "error",
    });
  }),
}));

vi.mock("../hosted-beta/learner-gate.js", () => ({
  requireLearner: vi.fn(async () => ({
    actor: { id: "usr_1", email: "learner@studyagent.local" },
    productState: { studyAccess: 1, ingestionAccess: 0, adminAccess: 0 },
  })),
}));

type TemplateRow = typeof studyTemplates.$inferSelect;

function createTemplate(overrides: Partial<TemplateRow> = {}): TemplateRow {
  const now = new Date();
  return {
    id: "st_1",
    slug: "intro-calc",
    title: "Intro Calculus",
    topic: "Calculus",
    sourceLevel: "undergraduate",
    estimatedMinutes: 90,
    studyMode: "guided",
    expectedOutcome: "Understand limits and derivatives",
    status: "published",
    notebookId: "nb_template",
    readinessJson: { status: "ready" },
    sourceRightsJson: { status: "reviewed" },
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const COMPLETE_AUDIT: TemplateReadinessAudit = {
  readySources: 1,
  chunks: 1,
  wikiPages: 1,
  concepts: 1,
  claims: 1,
  curricula: 1,
  modules: 1,
  objectives: 1,
  sessionPlans: 1,
};

const EMPTY_AUDIT: TemplateReadinessAudit = {
  readySources: 0,
  chunks: 0,
  wikiPages: 0,
  concepts: 0,
  claims: 0,
  curricula: 0,
  modules: 0,
  objectives: 0,
  sessionPlans: 0,
};

function createListDb(
  rows: TemplateRow[],
  auditsByNotebookId: Record<string, TemplateReadinessAudit> = { nb_template: COMPLETE_AUDIT },
) {
  const db = {
    select() {
      return {
        from(table: unknown) {
          const tableRows = table === studyTemplates ? rows : [];
          const query = {
            where(_condition: unknown) {
              return {
                limit: async (count: number) => tableRows.slice(0, count),
              };
            },
            then(onFulfilled: (value: TemplateRow[]) => unknown, onRejected?: (reason: unknown) => unknown) {
              return Promise.resolve(tableRows).then(onFulfilled, onRejected);
            },
          };
          return query;
        },
      };
    },
    update(table: unknown) {
      return {
        set(patch: Partial<TemplateRow>) {
          return {
            where: async (_condition: unknown) => {
              if (table === studyTemplates && rows[0]) {
                Object.assign(rows[0], patch);
              }
            },
          };
        },
      };
    },
  };
  const sql = async (_strings: TemplateStringsArray, notebookId: string) => [
    auditsByNotebookId[notebookId] ?? EMPTY_AUDIT,
  ];
  return { db, sql };
}

describe("study template helpers", () => {
  it("requires readiness and source rights for learner visibility", () => {
    expect(isTemplateReadinessComplete({ status: "ready" })).toBe(true);
    expect(isSourceRightsReviewed({ status: "reviewed" })).toBe(true);
    expect(isLearnerVisibleTemplate(createTemplate())).toBe(true);
    expect(isLearnerVisibleTemplate(createTemplate({ status: "draft" }))).toBe(false);
    expect(isLearnerVisibleTemplate(createTemplate({ readinessJson: { status: "pending" } }))).toBe(false);
    expect(isLearnerVisibleTemplate(createTemplate({ sourceRightsJson: { status: "pending" } }))).toBe(false);
    const restricted = createTemplate({
      readinessJson: { status: "ready", requiresAccessGrant: true },
    });
    expect(isTemplateAccessibleToLearner(restricted, {})).toBe(false);
    expect(
      isTemplateAccessibleToLearner(restricted, { grantedTemplateIds: ["st_1"] }),
    ).toBe(true);
  });

  it("requires generated content for content readiness", () => {
    expect(isTemplateContentReady(COMPLETE_AUDIT)).toBe(true);
    expect(isTemplateContentReady({ ...COMPLETE_AUDIT, sessionPlans: 0 })).toBe(false);
    expect(missingTemplateReadinessRequirements({ ...COMPLETE_AUDIT, wikiPages: 0, objectives: 0 })).toEqual([
      "published wiki page",
      "active objective",
    ]);
  });

  it("maps template summary fields", () => {
    expect(toTemplateSummary(createTemplate())).toEqual({
      id: "st_1",
      slug: "intro-calc",
      title: "Intro Calculus",
      topic: "Calculus",
      sourceLevel: "undergraduate",
      estimatedMinutes: 90,
      studyMode: "guided",
      expectedOutcome: "Understand limits and derivatives",
    });
  });
});

describe("GET /study-templates", () => {
  let app = Fastify();

  beforeEach(async () => {
    app = Fastify();
    await registerStudyTemplateRoutes(app, {
      db: createListDb(
        [
          createTemplate(),
          createTemplate({
            id: "st_stub",
            slug: "stub",
            title: "Stub",
            notebookId: "nb_stub",
          }),
          createTemplate({
            id: "st_draft",
            slug: "draft-only",
            title: "Draft",
            status: "draft",
          }),
          createTemplate({
            id: "st_restricted",
            slug: "restricted",
            title: "Restricted",
            readinessJson: { status: "ready", requiresAccessGrant: true },
          }),
        ],
        { nb_template: COMPLETE_AUDIT, nb_stub: EMPTY_AUDIT },
      ),
      env: {},
    } as unknown as AppContext);
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns only published learner-visible templates", async () => {
    const response = await app.inject({ method: "GET", url: "/study-templates" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { templates: Array<{ id: string; title: string }> };
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0]).toMatchObject({
      id: "st_1",
      title: "Intro Calculus",
      topic: "Calculus",
      sourceLevel: "undergraduate",
      estimatedMinutes: 90,
      studyMode: "guided",
    });
  });
});

describe("PATCH /admin/study-templates/:id", () => {
  let app = Fastify();

  afterEach(async () => {
    await app.close();
  });

  it("rejects publishing when readiness metadata is complete but generated content is missing", async () => {
    app = Fastify();
    await registerStudyTemplateRoutes(app, {
      db: createListDb([createTemplate({ status: "draft" })], { nb_template: EMPTY_AUDIT }),
      env: {},
    } as unknown as AppContext);

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/study-templates/st_1",
      payload: {
        status: "published",
        readinessJson: { status: "ready" },
        sourceRightsJson: { status: "reviewed" },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "template_not_ready",
      missingRequirements: expect.arrayContaining(["published wiki page", "active session plan"]),
    });
  });

  it("allows publishing when metadata and generated content are complete", async () => {
    const rows = [createTemplate({ status: "draft" })];
    app = Fastify();
    await registerStudyTemplateRoutes(app, {
      db: createListDb(rows, { nb_template: COMPLETE_AUDIT }),
      env: {},
    } as unknown as AppContext);

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/study-templates/st_1",
      payload: {
        status: "published",
        readinessJson: { status: "ready" },
        sourceRightsJson: { status: "reviewed" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(rows[0]).toMatchObject({ status: "published" });
  });
});
