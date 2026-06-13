import { describe, expect, it } from "vitest";
import { resolveWorkspaceRefreshPolicy, workspaceRefreshPolicyForEvent } from "./workspace-refresh.js";

describe("workspace refresh contract", () => {
  it("authors refresh hints for reference regeneration events", () => {
    expect(workspaceRefreshPolicyForEvent("reference.regenerated", {
      targets: [],
      nodeIds: ["artifact_1"],
      artifactIds: [],
      sourceIds: [],
    }).targets).toEqual(expect.arrayContaining(["graph", "referenceSurfaces", "curriculum"]));
  });

  it("authors quiz attempt refresh hints scoped to the artifact", () => {
    expect(workspaceRefreshPolicyForEvent("quiz.attempt.recorded", {
      targets: [],
      nodeIds: [],
      artifactIds: ["artifact_1"],
      sourceIds: [],
    }).targets).toEqual(expect.arrayContaining(["graph", "studyState", "quizAttempts", "artifacts"]));
  });

  it("invalidates graph and reference surfaces when page readiness changes", () => {
    expect(resolveWorkspaceRefreshPolicy("wiki.page.readiness_changed").targets).toEqual(
      expect.arrayContaining(["graph", "referenceSurfaces", "curriculum"]),
    );
    expect(resolveWorkspaceRefreshPolicy("generation.page.readiness_changed").targets).toEqual(
      expect.arrayContaining(["graph", "referenceSurfaces", "curriculum"]),
    );
  });

  it("invalidates source files when source lifecycle events fire", () => {
    expect(resolveWorkspaceRefreshPolicy("source.uploaded").targets).toEqual(["sources", "sourceFiles"]);
    expect(resolveWorkspaceRefreshPolicy("source.tutoring_ready").targets).toEqual(expect.arrayContaining(["sources", "graph", "sourceFiles"]));
  });

  it("merges server hints with event-derived refresh targets", () => {
    expect(resolveWorkspaceRefreshPolicy("artifact.updated", {
      targets: ["referenceSurfaces"],
      nodeIds: ["artifact_1"],
      artifactIds: ["artifact_1"],
      sourceIds: [],
    })).toMatchObject({
      targets: expect.arrayContaining(["referenceSurfaces", "artifacts", "graph", "studyState"]),
      nodeIds: ["artifact_1"],
      artifactIds: ["artifact_1"],
    });
  });
});
