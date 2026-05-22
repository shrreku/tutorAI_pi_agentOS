import { describe, expect, it } from "vitest";
import {
  buildSyntheticLearnerEvalMatrix,
  evalSourceFixtureManifestSchema,
  syntheticLearnerAssertionSchema,
  syntheticLearnerEvalMatrixSchema,
} from "./synthetic-learner-evals.js";
import {
  syntheticLearnerEvalTracerBulletFixture,
  syntheticLearnerEvalTracerBulletPersonas,
  syntheticLearnerEvalTracerBulletScenarios,
} from "./synthetic-learner-evals.fixtures.js";

describe("synthetic learner eval contracts", () => {
  it("validates the first tracer bullet fixture manifest", () => {
    const parsed = evalSourceFixtureManifestSchema.parse(syntheticLearnerEvalTracerBulletFixture);
    expect(parsed.learnerAnalyticsScope).toBe("eval_only");
    expect(parsed.compatible).toBe(true);
  });

  it("expands the 1 x 3 x 3 tracer bullet into nine planned runs", () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas,
      scenarios: syntheticLearnerEvalTracerBulletScenarios,
    });

    expect(matrix.runs).toHaveLength(9);
    expect(matrix.runs[0]).toMatchObject({
      fixtureManifestId: syntheticLearnerEvalTracerBulletFixture.id,
      seededNotebookId: syntheticLearnerEvalTracerBulletFixture.seededNotebookId,
      status: "planned",
    });
    expect(
      new Set(matrix.runs.map((run) => `${run.personaId}:${run.scenarioId}`)),
    ).toHaveLength(9);
  });

  it("validates persisted run records with learner-visible assertions", () => {
    const matrix = buildSyntheticLearnerEvalMatrix({
      fixture: syntheticLearnerEvalTracerBulletFixture,
      personas: syntheticLearnerEvalTracerBulletPersonas.slice(0, 1),
      scenarios: syntheticLearnerEvalTracerBulletScenarios.slice(0, 1),
    });

    const run = {
      ...matrix.runs[0]!,
      status: "passed" as const,
      completedAt: "2026-05-22T00:05:00.000Z",
      durationMs: 300,
      studentMessages: ["Teach me the topic."],
      tutorMessages: ["Let's work through a checkpoint."],
      toolEvents: [
        {
          label: "fetch_context",
          toolName: "notebook.search",
          nodeRefs: [{ refType: "source", refId: "src_1" }],
        },
      ],
      runtimeEvents: [
        {
          eventType: "learning.evaluate_response",
          payload: { label: "partial" },
          timestamp: "2026-05-22T00:04:30.000Z",
        },
      ],
      assertions: [
        {
          id: "assert_1",
          category: "learner_visible",
          description: "Tutor text does not leak raw IDs.",
          passed: true,
          evidenceRefs: [{ refType: "turn", refId: "turn_1" }],
          details: { checkedFragments: 2 },
        },
      ],
      artifactRefs: [{ refType: "artifact", refId: "artifact_1" }],
      traceRefs: [{ refType: "session", refId: "sess_1" }],
      finalState: { passed: true, summary: "Scenario completed cleanly." },
    };

    const parsed = syntheticLearnerEvalMatrixSchema.parse({
      ...matrix,
      runs: [run],
    });

    expect(parsed.runs[0]?.assertions[0]?.category).toBe("learner_visible");
    expect(syntheticLearnerAssertionSchema.parse(run.assertions[0]!).passed).toBe(true);
  });
});
