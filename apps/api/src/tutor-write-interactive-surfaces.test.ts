import { describe, expect, it, vi } from "vitest";
import { createInteractiveSurfaceWriteHandlers } from "./tutor-write-interactive-surfaces.js";

vi.mock("./interactive-surface-launch.js", () => ({
  requestInteractiveSurfaceLaunch: vi.fn().mockResolvedValue({ eventId: "evt_launch_1" }),
}));

describe("tutor interactive surface writes", () => {
  it("launches a workspace surface and returns reducer metadata", async () => {
    const handlers = createInteractiveSurfaceWriteHandlers({} as never);
    const result = await handlers.launchInteractiveSurface(
      { nodeId: "artifact_quiz_1", nodeRefType: "artifact", blockKind: "quiz" },
      {
        notebookId: "nb_1",
        userId: "user_1",
        sessionId: "session_1",
        turnId: "turn_1",
        runId: "run_1",
        traceId: "trace_1",
        selectedNodeRefs: [],
        permissions: {},
      },
    );

    expect(result.launched).toBe(true);
    expect(result.nodeId).toBe("artifact_quiz_1");
    expect(result.reducerResult.mutationType).toBe("session.focus.updated");
  });
});
