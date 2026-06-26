import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountDeletionRequests,
  notebooks,
  sources,
  userProductState,
  users,
} from "@studyagent/db";
import type { AppContext } from "../context.js";
import { resetCachedDevActorForTests } from "../auth.js";
import {
  deleteOwnedPersonalWorkspace,
  deleteOwnedPrivateSource,
  registerAccountRoutes,
} from "./account.js";

type NotebookRow = {
  id: string;
  ownerId: string;
  title: string;
  workspaceType: string;
  description?: string | null;
  goal?: string | null;
  defaultMode?: string;
  studyTemplateId?: string | null;
  disabledAt?: Date | null;
  settingsJson?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
};

type SourceRow = {
  id: string;
  notebookId: string;
  title: string;
  sourceType: string;
  originalObjectKey: string;
  status: string;
  metadataJson?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
};

type DeletionRequestRow = {
  id: string;
  userId: string;
  status: string;
  notes: string | null;
  requestedAt: Date;
  completedAt: Date | null;
};

function createAccountTestContext(options?: { admin?: boolean; s3Configured?: boolean }) {
  const notebookRows: NotebookRow[] = [
    {
      id: "nb_personal",
      ownerId: "usr_1",
      title: "Personal workspace",
      workspaceType: "personal_learner",
    },
    {
      id: "nb_template",
      ownerId: "usr_1",
      title: "Template workspace",
      workspaceType: "study_template",
    },
  ];

  const sourceRows: SourceRow[] = [
    {
      id: "src_1",
      notebookId: "nb_personal",
      title: "Lecture notes",
      sourceType: "pdf",
      originalObjectKey: "notebooks/nb_personal/sources/src_1/original",
      status: "uploaded",
    },
  ];

  const deletionRequestRows: DeletionRequestRow[] = [];
  const deletedObjectKeys: string[] = [];
  const s3Send = vi.fn(async (command: { input?: { Key?: string } }) => {
    if (command.input?.Key) {
      deletedObjectKeys.push(command.input.Key);
    }
    return {};
  });

  const db = {
    select() {
      return {
        from(table: unknown) {
          return {
            where(condition: unknown) {
              void condition;
              const listForTable = () => {
                if (table === notebooks) return notebookRows;
                if (table === sources) return sourceRows;
                if (table === accountDeletionRequests) return deletionRequestRows;
                if (table === users) return [{ id: "usr_1", email: "learner@studyagent.local" }];
                if (table === userProductState) {
                  return [
                    {
                      userId: "usr_1",
                      studyAccess: 1,
                      ingestionAccess: 0,
                      adminAccess: options?.admin ? 1 : 0,
                      pilotTagsJson: [],
                      onboardingJson: {},
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    },
                  ];
                }
                return [];
              };

              return {
                limit: async (count: number) => listForTable().slice(0, count),
                orderBy(_order: unknown) {
                  const rows = listForTable();
                  const sorted =
                    table === accountDeletionRequests
                      ? [...(rows as DeletionRequestRow[])].sort(
                          (left, right) => right.requestedAt.getTime() - left.requestedAt.getTime(),
                        )
                      : rows;
                  return {
                    limit: async (count: number) => sorted.slice(0, count),
                  };
                },
                then(
                  onFulfilled: (value: unknown[]) => unknown,
                  onRejected?: (reason: unknown) => unknown,
                ) {
                  return Promise.resolve(listForTable()).then(onFulfilled, onRejected);
                },
              };
            },
            orderBy(_order: unknown) {
              return Promise.resolve(
                table === accountDeletionRequests
                  ? [...deletionRequestRows].sort(
                      (left, right) => right.requestedAt.getTime() - left.requestedAt.getTime(),
                    )
                  : [],
              );
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values: async (row: DeletionRequestRow) => {
          if (table === accountDeletionRequests) {
            deletionRequestRows.push(row);
          }
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Partial<DeletionRequestRow>) {
          return {
            where(condition: unknown) {
              void condition;
              return Promise.resolve().then(() => {
                if (table !== accountDeletionRequests) return;
                const row = deletionRequestRows[0];
                if (!row) return;
                Object.assign(row, values);
              });
            },
          };
        },
      };
    },
    delete(table: unknown) {
      return {
        where(condition: unknown) {
          void condition;
          return {
            returning() {
              return {
                async execute() {
                  if (table === notebooks) {
                    const index = notebookRows.findIndex((row) => row.id === "nb_personal");
                    if (index >= 0) {
                      notebookRows.splice(index, 1);
                      return [{ id: "nb_personal" }];
                    }
                  }
                  if (table === sources) {
                    const index = sourceRows.findIndex((row) => row.id === "src_1");
                    if (index >= 0) {
                      sourceRows.splice(index, 1);
                      return [{ id: "src_1" }];
                    }
                  }
                  return [];
                },
              };
            },
            then(
              onFulfilled: (value: unknown) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              if (table === notebooks) {
                const index = notebookRows.findIndex((row) => row.id === "nb_personal");
                if (index >= 0) notebookRows.splice(index, 1);
              }
              if (table === sources) {
                const index = sourceRows.findIndex((row) => row.id === "src_1");
                if (index >= 0) sourceRows.splice(index, 1);
              }
              return Promise.resolve(undefined).then(onFulfilled, onRejected);
            },
          };
        },
      };
    },
  };

  const ctx = {
    env: {
      DISABLE_AUTH: true,
      DEV_USER_EMAIL: "learner@studyagent.local",
      SESSION_SECRET: "studyagent-local-session-secret",
      OBJECT_STORAGE_BUCKET: "studyagent-local",
    },
    db: { db },
    s3: options?.s3Configured === false ? null : { send: s3Send },
    ingestionQueue: null,
    redis: null,
  } as unknown as AppContext;

  return {
    ctx,
    notebookRows,
    sourceRows,
    deletionRequestRows,
    deletedObjectKeys,
    s3Send,
  };
}

describe("account routes", () => {
  beforeEach(() => {
    resetCachedDevActorForTests();
  });

  afterEach(() => {
    resetCachedDevActorForTests();
  });

  it("deletes owned personal learner workspaces and their object storage", async () => {
    const { ctx, notebookRows, deletedObjectKeys } = createAccountTestContext();
    const outcome = await deleteOwnedPersonalWorkspace(ctx, "usr_1", "nb_personal");
    expect(outcome).toBe("deleted");
    expect(notebookRows.some((row) => row.id === "nb_personal")).toBe(false);
    expect(deletedObjectKeys).toEqual(["notebooks/nb_personal/sources/src_1/original"]);
  });

  it("rejects deleting non-personal workspaces", async () => {
    const { ctx, notebookRows } = createAccountTestContext();
    notebookRows.length = 0;
    notebookRows.push({
      id: "nb_template",
      ownerId: "usr_1",
      title: "Template workspace",
      workspaceType: "study_template",
    });
    const outcome = await deleteOwnedPersonalWorkspace(ctx, "usr_1", "nb_template");
    expect(outcome).toBe("forbidden");
  });

  it("deletes owned private sources and object storage", async () => {
    const { ctx, sourceRows, deletedObjectKeys } = createAccountTestContext();
    const outcome = await deleteOwnedPrivateSource(ctx, "usr_1", "src_1");
    expect(outcome).toBe("deleted");
    expect(sourceRows.some((row) => row.id === "src_1")).toBe(false);
    expect(deletedObjectKeys).toEqual(["notebooks/nb_personal/sources/src_1/original"]);
  });

  it("creates account deletion requests", async () => {
    const { ctx, deletionRequestRows } = createAccountTestContext();
    const app = Fastify();
    await registerAccountRoutes(app, ctx);

    const response = await app.inject({
      method: "POST",
      url: "/account/deletion-request",
      payload: { notes: "Please delete my account" },
    });

    expect(response.statusCode).toBe(201);
    expect(deletionRequestRows).toHaveLength(1);
    expect(deletionRequestRows[0]).toMatchObject({
      userId: "usr_1",
      status: "requested",
      notes: "Please delete my account",
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/account/deletion-request",
      payload: { notes: "Please delete my account again" },
    });
    expect(duplicate.statusCode).toBe(200);
    expect(deletionRequestRows).toHaveLength(1);
    expect(duplicate.json()).toEqual({
      request: expect.objectContaining({ id: deletionRequestRows[0]!.id }),
    });
  });

  it("lets admins list and update deletion requests", async () => {
    const { ctx, deletionRequestRows } = createAccountTestContext({ admin: true });
    deletionRequestRows.push({
      id: "adr_1",
      userId: "usr_1",
      status: "requested",
      notes: null,
      requestedAt: new Date("2026-06-17T00:00:00.000Z"),
      completedAt: null,
    });

    const app = Fastify();
    await registerAccountRoutes(app, ctx);

    const listResponse = await app.inject({
      method: "GET",
      url: "/admin/account-deletion-requests",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      requests: [
        expect.objectContaining({
          id: "adr_1",
          status: "requested",
        }),
      ],
    });

    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/admin/account-deletion-requests/adr_1",
      payload: { status: "completed", notes: "Handled in WorkOS and DB" },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(deletionRequestRows[0]).toMatchObject({
      status: "completed",
      notes: "Handled in WorkOS and DB",
    });
    expect(deletionRequestRows[0]?.completedAt).toBeInstanceOf(Date);
  });
});
