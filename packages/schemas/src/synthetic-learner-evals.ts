import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";

export const syntheticLearnerModeSchema = z.enum(["scripted", "live"]);

export const syntheticLearnerPersonaSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  mode: syntheticLearnerModeSchema,
  learnerSummary: z.string().min(1),
  goalSummary: z.string().min(1),
  styleHints: z.array(z.string().min(1)).default([]),
  forbiddenLeaks: z.array(z.string().min(1)).default([]),
});

export const syntheticLearnerScenarioKindSchema = z.enum([
  "lesson_and_remediation",
  "artifact_request",
  "session_completion",
]);

export const syntheticLearnerScenarioSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: syntheticLearnerScenarioKindSchema,
  entryPrompt: z.string().min(1),
  objectiveId: idSchema.optional(),
  beatIds: z.array(idSchema).default([]),
  expectedAssertions: z.array(z.string().min(1)).default([]),
});

export const evalSourceFixtureManifestSchema = z.object({
  id: idSchema,
  version: z.string().min(1),
  sourceContentHash: z.string().min(1),
  ingestionPipelineVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  compatible: z.boolean(),
  seededNotebookId: idSchema,
  learnerAnalyticsScope: z.enum(["eval_only", "production"]).default("eval_only"),
  notes: z.string().default(""),
});

export const syntheticLearnerAssertionCategorySchema = z.enum([
  "learner_visible",
  "runtime",
  "persistence",
  "report",
]);

export const syntheticLearnerAssertionSchema = z.object({
  id: idSchema,
  category: syntheticLearnerAssertionCategorySchema,
  description: z.string().min(1),
  passed: z.boolean(),
  evidenceRefs: z.array(nodeRefSchema).default([]),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const syntheticLearnerToolEventSchema = z.object({
  label: z.string().min(1),
  toolName: z.string().min(1),
  nodeRefs: z.array(nodeRefSchema).default([]),
});

export const syntheticLearnerRuntimeEventSchema = z.object({
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string().datetime(),
});

export const syntheticLearnerRunStatusSchema = z.enum(["planned", "running", "passed", "failed", "skipped"]);

export const syntheticLearnerEvalRunSchema = z.object({
  id: idSchema,
  fixtureManifestId: idSchema,
  personaId: idSchema,
  scenarioId: idSchema,
  seededNotebookId: idSchema,
  status: syntheticLearnerRunStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  studentMessages: z.array(z.string().min(1)).default([]),
  tutorMessages: z.array(z.string().min(1)).default([]),
  toolEvents: z.array(syntheticLearnerToolEventSchema).default([]),
  runtimeEvents: z.array(syntheticLearnerRuntimeEventSchema).default([]),
  assertions: z.array(syntheticLearnerAssertionSchema).default([]),
  artifactRefs: z.array(nodeRefSchema).default([]),
  traceRefs: z.array(nodeRefSchema).default([]),
  finalState: z.object({
    passed: z.boolean(),
    summary: z.string().min(1),
  }),
});

export const syntheticLearnerEvalMatrixSchema = z.object({
  fixture: evalSourceFixtureManifestSchema,
  personas: z.array(syntheticLearnerPersonaSchema).min(1),
  scenarios: z.array(syntheticLearnerScenarioSchema).min(1),
  runs: z.array(syntheticLearnerEvalRunSchema).min(1),
});

export type SyntheticLearnerMode = z.infer<typeof syntheticLearnerModeSchema>;
export type SyntheticLearnerPersona = z.infer<typeof syntheticLearnerPersonaSchema>;
export type SyntheticLearnerScenarioKind = z.infer<typeof syntheticLearnerScenarioKindSchema>;
export type SyntheticLearnerScenario = z.infer<typeof syntheticLearnerScenarioSchema>;
export type EvalSourceFixtureManifest = z.infer<typeof evalSourceFixtureManifestSchema>;
export type SyntheticLearnerAssertionCategory = z.infer<typeof syntheticLearnerAssertionCategorySchema>;
export type SyntheticLearnerAssertion = z.infer<typeof syntheticLearnerAssertionSchema>;
export type SyntheticLearnerToolEvent = z.infer<typeof syntheticLearnerToolEventSchema>;
export type SyntheticLearnerRuntimeEvent = z.infer<typeof syntheticLearnerRuntimeEventSchema>;
export type SyntheticLearnerRunStatus = z.infer<typeof syntheticLearnerRunStatusSchema>;
export type SyntheticLearnerEvalRun = z.infer<typeof syntheticLearnerEvalRunSchema>;
export type SyntheticLearnerEvalMatrix = z.infer<typeof syntheticLearnerEvalMatrixSchema>;

export function buildSyntheticLearnerEvalMatrix(input: {
  fixture: EvalSourceFixtureManifest;
  personas: SyntheticLearnerPersona[];
  scenarios: SyntheticLearnerScenario[];
  seededNotebookId?: string;
  createdAt?: string;
}): SyntheticLearnerEvalMatrix {
  const seededNotebookId = input.seededNotebookId ?? input.fixture.seededNotebookId;
  const createdAt = input.createdAt ?? input.fixture.generatedAt;
  const runs = input.personas.flatMap((persona) =>
    input.scenarios.map((scenario) => ({
      id: `slrun_${input.fixture.id}_${persona.id}_${scenario.id}`,
      fixtureManifestId: input.fixture.id,
      personaId: persona.id,
      scenarioId: scenario.id,
      seededNotebookId,
      status: "planned" as const,
      startedAt: createdAt,
      studentMessages: [],
      tutorMessages: [],
      toolEvents: [],
      runtimeEvents: [],
      assertions: [],
      artifactRefs: [],
      traceRefs: [],
      finalState: {
        passed: false,
        summary: "Planned run",
      },
    })),
  );

  return {
    fixture: input.fixture,
    personas: input.personas,
    scenarios: input.scenarios,
    runs,
  };
}
