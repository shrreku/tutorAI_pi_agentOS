import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  applyWorkspaceRefreshInvalidations,
  resolveWorkspaceRefreshPolicy,
  WORKSPACE_REFRESH_EVENT_TYPES,
} from "./workspace-refresh-policy.js";

describe("workspaceRefreshPolicyForEvent", () => {
  it("maps source readiness events to source and graph refreshes", () => {
    expect(resolveWorkspaceRefreshPolicy("source.tutoring_ready").targets).toEqual(expect.arrayContaining(["sources", "graph", "sourceFiles"]));
    expect(resolveWorkspaceRefreshPolicy("source.readiness.updated").targets).toEqual(expect.arrayContaining(["sources", "graph", "sourceFiles"]));
  });

  it("maps planning and mastery events to graph and study-state refreshes", () => {
    expect(resolveWorkspaceRefreshPolicy("session_plan.updated").targets).toEqual(["graph", "studyState"]);
    expect(resolveWorkspaceRefreshPolicy("learning.mastery_evidence.recorded").targets).toEqual(["graph", "studyState"]);
  });

  it("maps artifact events to every artifact surface that can show stale data", () => {
    expect(resolveWorkspaceRefreshPolicy("artifact.ready").targets).toEqual([
      "artifacts",
      "referenceSurfaces",
      "graph",
      "studyState",
    ]);
  });

  it("merges server-authored refresh hints with event policy targets", () => {
    expect(resolveWorkspaceRefreshPolicy("reference.regenerated", {
      targets: ["referenceSurfaces", "graph", "curriculum"],
      nodeIds: ["artifact_1"],
      artifactIds: [],
      sourceIds: [],
    })).toMatchObject({
      label: "reference regenerated",
      targets: expect.arrayContaining(["referenceSurfaces", "graph", "curriculum"]),
      nodeIds: ["artifact_1"],
      artifactIds: [],
      sourceIds: [],
    });
  });

  it("keeps every known workspace event on a non-empty policy path", () => {
    for (const eventType of WORKSPACE_REFRESH_EVENT_TYPES) {
      expect(resolveWorkspaceRefreshPolicy(eventType).targets.length).toBeGreaterThan(0);
    }
  });

  it("does not refresh the Workspace for unknown server events", () => {
    expect(resolveWorkspaceRefreshPolicy("future.event.added").targets).toEqual([]);
  });
});

describe("applyWorkspaceRefreshInvalidations", () => {
  it("invalidates source file and quiz attempt queries from policy targets", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const onGraphProjectionUpdated = vi.fn();

    applyWorkspaceRefreshInvalidations({
      notebookId: "nb_1",
      policy: {
        label: "quiz attempt",
        targets: ["quizAttempts", "sourceFiles"],
        nodeIds: [],
        artifactIds: ["artifact_1"],
        sourceIds: ["src_1"],
      },
      queryClient,
      onGraphProjectionUpdated,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["quiz-attempts", "nb_1", "artifact_1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["reference-surface", "nb_1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["reference-surface", "nb_1", "src_1"] });
  });
});
