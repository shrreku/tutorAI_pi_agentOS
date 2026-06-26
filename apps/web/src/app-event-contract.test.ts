import { describe, expect, it } from "vitest";
import { eventTypeSchema } from "@studyagent/schemas";
import {
  WORKSPACE_REFRESH_EVENT_TYPES,
  shouldInvalidateArtifactsForEvent,
} from "./workspace-refresh-policy.js";

describe("app event listener contract", () => {
  it("subscribes only to schema-defined event names", () => {
    const listenedEvents = [
      "source.tutoring_ready",
      "ingestion.job.completed",
      "ingestion.job.failed",
      "graph.neo4j_projection.updated",
      "source.uploaded",
      ...WORKSPACE_REFRESH_EVENT_TYPES,
    ] as const;

    for (const eventType of listenedEvents) {
      expect(eventTypeSchema.parse(eventType)).toBe(eventType);
    }
  });

  it("invalidates artifact queries for artifact and quiz-attempt events", () => {
    expect(shouldInvalidateArtifactsForEvent("artifact.ready")).toBe(true);
    expect(shouldInvalidateArtifactsForEvent("quiz.attempt.recorded")).toBe(true);
    expect(shouldInvalidateArtifactsForEvent("session_plan.updated")).toBe(false);
  });
});
