import { describe, expect, it } from "vitest";
import { eventTypeSchema } from "@studyagent/schemas";
import { WORKSPACE_REFRESH_EVENT_TYPES, shouldInvalidateArtifactsForEvent } from "./App.js";

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

  it("invalidates artifact queries only for artifact-scoped events", () => {
    for (const eventType of WORKSPACE_REFRESH_EVENT_TYPES) {
      const shouldInvalidate = shouldInvalidateArtifactsForEvent(eventType);
      if (eventType.startsWith("artifact.")) {
        expect(shouldInvalidate).toBe(true);
      } else {
        expect(shouldInvalidate).toBe(false);
      }
    }
  });
});
