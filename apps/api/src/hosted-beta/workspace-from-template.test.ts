import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  betaConsents,
  notebooks,
  productAnalyticsEvents,
  studyTemplates,
  userProductState,
  users,
} from "@studyagent/db";
import type { AppContext } from "../context.js";
import { resetCachedDevActorForTests } from "../auth.js";
import {
  createWorkspaceFromTemplate,
  listPersonalWorkspaces,
  WorkspaceFromTemplateError,
} from "./workspace-from-template.js";
import { recordProductAnalytics } from "./product-analytics.js";
import { registerWorkspaceRoutes } from "../routes/workspaces.js";

vi.mock("../agentic-cache-invalidation.js", () => ({
  appendEventWithTutorCacheInvalidation: vi
    .fn()
    .mockResolvedValue({ id: "evt_test", sequenceNo: 1 }),
}));

vi.mock("./product-analytics.js", () => ({
  recordProductAnalytics: vi.fn().mockResolvedValue({ id: "pae_test" }),
}));

type UserRow = { id: string; email: string; disabledAt?: Date | null };
type ProductStateRow = {
  userId: string;
  studyAccess: number;
  ingestionAccess: number;
  adminAccess: number;
  pilotTagsJson: string[];
  onboardingJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
type NotebookRow = {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  goal: string | null;
  defaultMode: string;
  workspaceType: string;
  studyTemplateId: string | null;
  disabledAt: Date | null;
  settingsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
type StudyTemplateRow = {
  id: string;
  slug: string;
  title: string;
  topic: string;
  sourceLevel: string;
  estimatedMinutes: number;
  studyMode: string;
  expectedOutcome: string;
  status: string;
  notebookId: string;
  readinessJson: Record<string, unknown>;
  sourceRightsJson: Record<string, unknown>;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};
type AnalyticsRow = {
  id: string;
  userId: string | null;
  eventName: string;
  propertiesJson: Record<string, unknown>;
  createdAt: Date;
};
type ConsentRow = {
  id: string;
  userId: string;
  consentVersion: string;
  acceptedAt: Date;
};

function extractSqlStringValues(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    found.push(value);
    return found;
  }
  if (!value || typeof value !== "object") {
    return found;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.value === "string") {
    found.push(record.value);
  }
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) {
      extractSqlStringValues(chunk, found);
    }
  }
  return found;
}

class WorkspaceFakeDb {
  notebookRows: NotebookRow[];
  templateRows: StudyTemplateRow[];
  productStateRows: ProductStateRow[];
  userRows: UserRow[];
  analyticsRows: AnalyticsRow[];
  consentRows: ConsentRow[];
  private selectProjection: unknown = null;

  constructor(input: {
    notebookRows: NotebookRow[];
    templateRows: StudyTemplateRow[];
    productStateRows: ProductStateRow[];
    userRows: UserRow[];
    consentRows?: ConsentRow[];
  }) {
    this.notebookRows = input.notebookRows;
    this.templateRows = input.templateRows;
    this.productStateRows = input.productStateRows;
    this.userRows = input.userRows;
    this.analyticsRows = [];
    this.consentRows = input.consentRows ?? [
      {
        id: "bc_test",
        userId: "usr_1",
        consentVersion: "2026-06-17",
        acceptedAt: new Date(),
      },
    ];
  }

  select(projection?: unknown) {
    this.selectProjection = projection ?? null;
    return this;
  }

  from(table: unknown) {
    const isCountQuery =
      typeof this.selectProjection === "object" &&
      this.selectProjection !== null &&
      "count" in (this.selectProjection as Record<string, unknown>);

    const buildResult = (condition?: unknown) => ({
      orderBy: (_order: unknown) =>
        this.execute(table, condition, isCountQuery, { orderDesc: true }),
      limit: (count: number) => this.execute(table, condition, isCountQuery, { limit: count }),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(this.execute(table, condition, isCountQuery)).then(onFulfilled, onRejected),
    });

    return {
      where: (condition: unknown) => buildResult(condition),
      ...buildResult(),
    };
  }

  insert(table: unknown) {
    return {
      values: async (row: Record<string, unknown>) => {
        if (table === notebooks) {
          this.notebookRows.push(row as NotebookRow);
        }
        if (table === productAnalyticsEvents) {
          this.analyticsRows.push(row as AnalyticsRow);
        }
        if (table === userProductState) {
          this.productStateRows.push(row as ProductStateRow);
        }
      },
    };
  }

  private execute(
    table: unknown,
    condition?: unknown,
    isCountQuery = false,
    options?: { orderDesc?: boolean; limit?: number },
  ): unknown {
    let rows: unknown[] = [];

    if (table === notebooks) {
      rows = this.notebookRows.filter(
        (row) =>
          row.ownerId === "usr_1" &&
          row.workspaceType === "personal_learner" &&
          row.disabledAt == null,
      );
    } else if (table === studyTemplates) {
      rows = [...this.templateRows];
      if (condition) {
        const params = extractSqlStringValues(condition);
        const templateId = params.find((value) => value.startsWith("st_"));
        if (templateId) {
          rows = this.templateRows.filter((row) => row.id === templateId);
        }
      }
    } else if (table === userProductState) {
      rows = [...this.productStateRows];
    } else if (table === users) {
      rows = [...this.userRows];
    } else if (table === betaConsents) {
      rows = [...this.consentRows];
    }

    if (options?.orderDesc && table === notebooks) {
      rows = [...rows].sort(
        (a, b) => (b as NotebookRow).updatedAt.getTime() - (a as NotebookRow).updatedAt.getTime(),
      );
    }

    if (typeof options?.limit === "number") {
      rows = rows.slice(0, options.limit);
    }

    if (isCountQuery) {
      return [{ count: rows.length }];
    }

    return rows;
  }
}

function createWorkspaceContext(options?: {
  productState?: Partial<ProductStateRow>;
  templates?: StudyTemplateRow[];
  notebooks?: NotebookRow[];
}) {
  const userRows: UserRow[] = [
    { id: "usr_1", email: "learner@studyagent.local", disabledAt: null },
  ];
  const productStateRows: ProductStateRow[] = [
    {
      userId: "usr_1",
      studyAccess: 1,
      ingestionAccess: 0,
      adminAccess: 0,
      pilotTagsJson: [],
      onboardingJson: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      ...options?.productState,
    },
  ];
  const notebookRows: NotebookRow[] = [...(options?.notebooks ?? [])];
  const templateRows: StudyTemplateRow[] = options?.templates ?? [
    {
      id: "st_template_1",
      slug: "intro-calc",
      title: "Intro Calculus",
      topic: "Calculus",
      sourceLevel: "undergraduate",
      estimatedMinutes: 45,
      studyMode: "guided",
      expectedOutcome: "Understand limits",
      status: "published",
      notebookId: "nb_template_1",
      readinessJson: { status: "ready" },
      sourceRightsJson: { status: "reviewed" },
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const fakeDb = new WorkspaceFakeDb({
    notebookRows,
    templateRows,
    productStateRows,
    userRows,
  });

  const ctx = {
    env: {
      DISABLE_AUTH: true,
      DEV_USER_EMAIL: "learner@studyagent.local",
      SESSION_SECRET: "studyagent-local-session-secret",
      BETA_CONSENT_VERSION: "2026-06-17",
      MAX_WORKSPACES_PER_LEARNER: 5,
    },
    db: { db: fakeDb },
  } as unknown as AppContext;

  return { ctx, notebookRows, templateRows, analyticsRows: fakeDb.analyticsRows, productStateRows };
}

describe("workspace-from-template", () => {
  it("creates a personal learner workspace referencing the template notebook", async () => {
    const { ctx, notebookRows } = createWorkspaceContext();

    const notebookId = await createWorkspaceFromTemplate(ctx, "usr_1", "st_template_1");

    expect(notebookId).toMatch(/^nb_/);
    expect(notebookRows).toHaveLength(1);
    expect(notebookRows[0]).toMatchObject({
      id: notebookId,
      ownerId: "usr_1",
      title: "Intro Calculus",
      workspaceType: "personal_learner",
      studyTemplateId: "st_template_1",
      settingsJson: {
        templateNotebookId: "nb_template_1",
        templateId: "st_template_1",
      },
    });
    expect(recordProductAnalytics).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: "usr_1",
        eventName: "workspace_created_from_template",
        properties: expect.objectContaining({
          templateId: "st_template_1",
          templateNotebookId: "nb_template_1",
        }),
      }),
    );
    expect(recordProductAnalytics).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        userId: "usr_1",
        eventName: "template_start",
        properties: expect.objectContaining({
          notebookId: expect.stringMatching(/^nb_/),
          templateId: "st_template_1",
          templateNotebookId: "nb_template_1",
        }),
      }),
    );
  });

  it("rejects unpublished or unreadiness templates", async () => {
    const { ctx } = createWorkspaceContext({
      templates: [
        {
          id: "st_draft",
          slug: "draft",
          title: "Draft",
          topic: "Topic",
          sourceLevel: "intro",
          estimatedMinutes: 30,
          studyMode: "guided",
          expectedOutcome: "Learn",
          status: "draft",
          notebookId: "nb_draft",
          readinessJson: { status: "pending" },
          sourceRightsJson: { status: "pending" },
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    await expect(createWorkspaceFromTemplate(ctx, "usr_1", "st_draft")).rejects.toMatchObject({
      code: "template_not_found",
      statusCode: 404,
    });
  });

  it("enforces the learner workspace cap", async () => {
    const existing: NotebookRow[] = Array.from({ length: 5 }, (_, index) => ({
      id: `nb_existing_${index}`,
      ownerId: "usr_1",
      title: `Workspace ${index}`,
      description: null,
      goal: null,
      defaultMode: "explore",
      workspaceType: "personal_learner",
      studyTemplateId: null,
      disabledAt: null,
      settingsJson: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const { ctx, notebookRows } = createWorkspaceContext({ notebooks: existing });

    await expect(createWorkspaceFromTemplate(ctx, "usr_1", "st_template_1")).rejects.toMatchObject({
      code: "workspace_limit_reached",
      statusCode: 409,
    });
    expect(notebookRows).toHaveLength(5);
  });

  it("lists personal workspaces with template summaries", async () => {
    const now = new Date();
    const { ctx } = createWorkspaceContext({
      notebooks: [
        {
          id: "nb_ws_1",
          ownerId: "usr_1",
          title: "Intro Calculus",
          description: null,
          goal: null,
          defaultMode: "explore",
          workspaceType: "personal_learner",
          studyTemplateId: "st_template_1",
          disabledAt: null,
          settingsJson: { templateNotebookId: "nb_template_1", templateId: "st_template_1" },
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const workspaces = await listPersonalWorkspaces(ctx, "usr_1");
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({
      id: "nb_ws_1",
      studyTemplateId: "st_template_1",
      templateNotebookId: "nb_template_1",
      template: {
        id: "st_template_1",
        title: "Intro Calculus",
        slug: "intro-calc",
      },
    });
  });
});

describe("workspace routes", () => {
  let app = Fastify();

  beforeEach(() => {
    resetCachedDevActorForTests();
    app = Fastify();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /workspaces/from-template creates a workspace", async () => {
    const { ctx } = createWorkspaceContext();
    await registerWorkspaceRoutes(app, ctx);

    const response = await app.inject({
      method: "POST",
      url: "/workspaces/from-template",
      payload: { templateId: "st_template_1" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { notebookId: string };
    expect(body.notebookId).toMatch(/^nb_/);
  });

  it("GET /workspaces returns learner workspaces", async () => {
    const now = new Date();
    const { ctx } = createWorkspaceContext({
      notebooks: [
        {
          id: "nb_ws_1",
          ownerId: "usr_1",
          title: "Intro Calculus",
          description: null,
          goal: null,
          defaultMode: "explore",
          workspaceType: "personal_learner",
          studyTemplateId: "st_template_1",
          disabledAt: null,
          settingsJson: { templateNotebookId: "nb_template_1", templateId: "st_template_1" },
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await registerWorkspaceRoutes(app, ctx);

    const response = await app.inject({ method: "GET", url: "/workspaces" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { workspaces: Array<{ id: string }> };
    expect(body.workspaces).toHaveLength(1);
    expect(body.workspaces[0]?.id).toBe("nb_ws_1");
  });
});

describe("WorkspaceFromTemplateError", () => {
  it("carries code and status", () => {
    const error = new WorkspaceFromTemplateError("workspace_limit_reached", "limit hit", 403);
    expect(error.code).toBe("workspace_limit_reached");
    expect(error.statusCode).toBe(403);
  });
});
