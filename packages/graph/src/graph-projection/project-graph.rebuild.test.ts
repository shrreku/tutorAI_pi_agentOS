import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalProjectionSnapshot } from "./types.js";

const {
  loadCanonicalProjectionSnapshotMock,
  clearSourceProjectionScopeMock,
  applyProjectionPlanMock,
  upsertSourceProjectionHealthMock,
  upsertNotebookProjectionHealthMock,
  verifyNeo4jProjectionMock,
  createNeo4jDriverMock,
} = vi.hoisted(() => ({
  loadCanonicalProjectionSnapshotMock: vi.fn(),
  clearSourceProjectionScopeMock: vi.fn(async () => undefined),
  applyProjectionPlanMock: vi.fn(async () => undefined),
  upsertSourceProjectionHealthMock: vi.fn(async () => undefined),
  upsertNotebookProjectionHealthMock: vi.fn(async () => undefined),
  verifyNeo4jProjectionMock: vi.fn(async () => ({ ok: true as const, message: "ok" })),
  createNeo4jDriverMock: vi.fn(() => ({
    session: () => ({
      run: vi.fn(async () => ({ records: [] })),
      close: vi.fn(async () => undefined),
    }),
    close: vi.fn(async () => undefined),
  })),
}));

vi.mock("./load-canonical-snapshot.js", () => ({
  loadCanonicalProjectionSnapshot: loadCanonicalProjectionSnapshotMock,
}));

vi.mock("./clear-projection-scope.js", () => ({
  clearNotebookProjectionScope: vi.fn(async () => undefined),
  clearSourceProjectionScope: clearSourceProjectionScopeMock,
}));

vi.mock("./apply-projection-plan.js", () => ({
  applyProjectionPlan: applyProjectionPlanMock,
}));

vi.mock("./projection-health.js", () => ({
  upsertSourceProjectionHealth: upsertSourceProjectionHealthMock,
  upsertNotebookProjectionHealth: upsertNotebookProjectionHealthMock,
}));

vi.mock("../neo4j-projection.js", () => ({
  createNeo4jDriver: createNeo4jDriverMock,
  verifyNeo4jProjection: verifyNeo4jProjectionMock,
}));

import { projectGraphFromCanonical } from "./project-graph.js";

function snapshot(): CanonicalProjectionSnapshot {
  return {
    notebookId: "nb_rebuild",
    scope: "source",
    sourceId: "src_1",
    sources: [{ id: "src_1", title: "Physics" }],
    concepts: [{ id: "cnc_shared", canonicalName: "Force" }],
    claims: [{ id: "clm_1", sourceId: "src_1", claimText: "F = ma", conceptIds: ["cnc_shared"] }],
    wikiPages: [],
    graphRelations: [],
    curricula: [],
    modules: [],
    objectiveLists: [],
    sessionPlans: [],
    objectives: [],
    studyPlans: [],
    coverageItems: [],
    coverageRecords: [],
  };
}

describe("projectGraphFromCanonical rebuild orchestration", () => {
  beforeEach(() => {
    loadCanonicalProjectionSnapshotMock.mockReset();
    clearSourceProjectionScopeMock.mockClear();
    applyProjectionPlanMock.mockClear();
    upsertSourceProjectionHealthMock.mockClear();
    upsertNotebookProjectionHealthMock.mockClear();
    loadCanonicalProjectionSnapshotMock.mockResolvedValue(snapshot());
  });

  it("clears source projection scope before replaying a rebuild", async () => {
    const result = await projectGraphFromCanonical({ db: {} } as never, {
      neo4jUri: "bolt://localhost:7687",
      neo4jUsername: "neo4j",
      neo4jPassword: "test",
    }, {
      notebookId: "nb_rebuild",
      scope: "source",
      sourceId: "src_1",
      rebuild: true,
      sourceVersionId: "sv_42",
    });

    expect(result.ok).toBe(true);
    expect(clearSourceProjectionScopeMock).toHaveBeenCalledBefore(applyProjectionPlanMock);
    expect(clearSourceProjectionScopeMock).toHaveBeenCalledWith(expect.anything(), "nb_rebuild", "src_1");
  });

  it("records source projection health with sourceVersionId after successful rebuild", async () => {
    await projectGraphFromCanonical({ db: {} } as never, {
      neo4jUri: "bolt://localhost:7687",
      neo4jUsername: "neo4j",
      neo4jPassword: "test",
    }, {
      notebookId: "nb_rebuild",
      scope: "source",
      sourceId: "src_1",
      rebuild: true,
      sourceVersionId: "sv_42",
    });

    expect(upsertSourceProjectionHealthMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        notebookId: "nb_rebuild",
        sourceId: "src_1",
        status: "healthy",
        sourceVersionId: "sv_42",
      }),
    );
    expect(upsertNotebookProjectionHealthMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        notebookId: "nb_rebuild",
        status: "healthy",
        projectionScope: "source",
      }),
    );
  });
});
