import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEvalEvidenceSnapshotRoutes } from "./eval-evidence-snapshot.js";

const captureNotebookEvalEvidenceSnapshot = vi.fn();

vi.mock("../eval-evidence-snapshot-capture.js", () => ({
  captureNotebookEvalEvidenceSnapshot: (...args: unknown[]) => captureNotebookEvalEvidenceSnapshot(...args),
}));

vi.mock("../auth.js", () => ({
  resolveActor: async () => ({ id: "user_eval_snapshot" }),
}));

describe("eval evidence snapshot routes", () => {
  beforeEach(() => {
    captureNotebookEvalEvidenceSnapshot.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("captures a persisted notebook evidence snapshot", async () => {
    captureNotebookEvalEvidenceSnapshot.mockResolvedValue({
      id: "snap_nb_test_after",
      capturedAt: "2026-05-22T00:00:00.000Z",
      notebookId: "nb_test",
      categories: [],
      snapshotRefs: [{ refType: "eval_evidence_snapshot", refId: "snap_nb_test_after" }],
    });

    const app = Fastify();
    await registerEvalEvidenceSnapshotRoutes(app, { db: { db: {} } } as never);

    const response = await app.inject({
      method: "GET",
      url: "/eval/notebooks/nb_test/evidence-snapshot?snapshotId=snap_nb_test_after",
    });

    expect(response.statusCode).toBe(200);
    expect(captureNotebookEvalEvidenceSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerId: "user_eval_snapshot",
        notebookId: "nb_test",
        snapshotId: "snap_nb_test_after",
      }),
    );
  });
});
