import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";

export const syntheticLearnerModeSchema = z.enum(["scripted", "live"]);

export const syntheticLearnerLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);

export const syntheticLearnerSourceFamiliaritySchema = z.enum([
  "unfamiliar",
  "somewhat_familiar",
  "familiar",
  "expert",
]);

export const syntheticLearnerResponsePolicySchema = z.object({
  mode: syntheticLearnerModeSchema,
  tone: z.enum(["supportive", "direct", "encouraging"]),
  brevity: z.enum(["short", "balanced", "detailed"]),
  askClarifyingQuestions: z.boolean(),
  referenceSourceMaterial: z.boolean(),
  stayInCharacter: z.boolean().default(true),
  constraints: z.array(z.string().min(1)).default([]),
});

export const syntheticLearnerPersonaSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  mode: syntheticLearnerModeSchema,
  backgroundSummary: z.string().min(1),
  goalSummary: z.string().min(1),
  learnerLevel: syntheticLearnerLevelSchema,
  sourceFamiliarity: syntheticLearnerSourceFamiliaritySchema,
  behaviors: z.array(z.string().min(1)).min(1),
  misconceptions: z.array(z.string().min(1)).default([]),
  studyHabits: z.array(z.string().min(1)).min(1),
  responsePolicy: syntheticLearnerResponsePolicySchema,
});

export const syntheticLearnerScenarioKindSchema = z.enum([
  "lesson_and_remediation",
  "artifact_request",
  "session_completion",
]);

export const syntheticLearnerScenarioBeatKindSchema = z.enum([
  "opening",
  "checkpoint",
  "remediation",
  "request",
  "generation",
  "review",
  "continue",
  "finish",
]);

export const syntheticLearnerAllowedActionSchema = z.enum([
  "ask_question",
  "answer_question",
  "request_hint",
  "request_artifact",
  "request_summary",
  "correct_mistake",
  "end_session",
]);

export const syntheticLearnerStopConditionSchema = z.enum([
  "turn_limit",
  "mastery_reached",
  "artifact_delivered",
  "session_concluded",
  "user_requests_stop",
]);

export const syntheticLearnerAssertionReferenceSchema = z.object({
  refType: z.literal("assertion"),
  refId: idSchema,
  label: z.string().min(1).optional(),
});

export const syntheticLearnerScenarioBeatSchema = z.object({
  id: idSchema,
  kind: syntheticLearnerScenarioBeatKindSchema,
  scriptedMessage: z.string().min(1),
  liveInstruction: z.string().min(1),
  allowedActions: z.array(syntheticLearnerAllowedActionSchema).min(1),
  stopConditions: z.array(syntheticLearnerStopConditionSchema).default([]),
  assertionRefs: z.array(syntheticLearnerAssertionReferenceSchema).default([]),
});

export const syntheticLearnerScenarioSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: syntheticLearnerScenarioKindSchema,
  sourceFixtureId: idSchema,
  personaIds: z.array(idSchema).min(1),
  beats: z.array(syntheticLearnerScenarioBeatSchema).min(1),
  maxTurns: z.number().int().positive(),
  stopConditions: z.array(syntheticLearnerStopConditionSchema).min(1),
  allowedActions: z.array(syntheticLearnerAllowedActionSchema).min(1),
  assertionRefs: z.array(syntheticLearnerAssertionReferenceSchema).default([]),
  entryPrompt: z.string().min(1),
  objectiveId: idSchema.optional(),
});

export const evalSourceFixtureCompatibilityStatusSchema = z.enum(["compatible", "needs_regeneration", "blocked"]);

export const evalSourceFixtureGenerationMetadataSchema = z.object({
  generatedBy: z.string().min(1),
  pipelineVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  sourceRevision: z.string().min(1).default("frozen-eval-fixture"),
  modelProvider: z.string().min(1).default("openrouter"),
  modelName: z.string().min(1).default("gpt-4.1"),
});

export const evalSourceFixtureReadinessCheckSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  passed: z.boolean(),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const evalSourceFixtureExpectedCitationSchema = z.object({
  refType: z.string().min(1),
  refId: idSchema,
  label: z.string().min(1).default("citation"),
});

export const evalSourceFixtureManifestSchema = z.object({
  id: idSchema,
  version: z.string().min(1),
  sourceContentHash: z.string().min(1),
  generationMetadata: evalSourceFixtureGenerationMetadataSchema,
  readinessChecks: z.array(evalSourceFixtureReadinessCheckSchema).default([]),
  expectedTopics: z.array(z.string().min(1)).default([]),
  expectedConcepts: z.array(z.string().min(1)).default([]),
  expectedCitations: z.array(evalSourceFixtureExpectedCitationSchema).default([]),
  compatibilityStatus: evalSourceFixtureCompatibilityStatusSchema,
  ingestionPipelineVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  compatible: z.boolean(),
  seededNotebookId: idSchema,
  learnerAnalyticsScope: z.enum(["eval_only", "production"]).default("eval_only"),
  notes: z.string().default(""),
  tutoringReadyState: z.record(z.string(), z.unknown()).default({}),
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

export const syntheticLearnerEvalStepKindSchema = z.enum([
  "prompt",
  "response",
  "tool_call",
  "assertion",
  "artifact",
  "trace",
  "checkpoint",
  "summary",
]);

export const syntheticLearnerEvalStepSchema = z.object({
  id: idSchema,
  stepIndex: z.number().int().nonnegative(),
  kind: syntheticLearnerEvalStepKindSchema,
  status: syntheticLearnerRunStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  studentMessage: z.string().min(1).optional(),
  tutorMessage: z.string().min(1).optional(),
  toolEvents: z.array(syntheticLearnerToolEventSchema).default([]),
  runtimeEvents: z.array(syntheticLearnerRuntimeEventSchema).default([]),
  assertions: z.array(syntheticLearnerAssertionSchema).default([]),
  artifactRefs: z.array(nodeRefSchema).default([]),
  traceRefs: z.array(nodeRefSchema).default([]),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const syntheticLearnerEvalScenarioRunSchema = z.object({
  id: idSchema,
  runId: idSchema.optional(),
  fixtureManifestId: idSchema,
  fixtureVersion: z.string().min(1),
  personaId: idSchema,
  scenarioId: idSchema,
  seededNotebookId: idSchema,
  status: syntheticLearnerRunStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  steps: z.array(syntheticLearnerEvalStepSchema).default([]),
  assertions: z.array(syntheticLearnerAssertionSchema).default([]),
  artifactRefs: z.array(nodeRefSchema).default([]),
  traceRefs: z.array(nodeRefSchema).default([]),
  notebookRefs: z.array(nodeRefSchema).default([]),
  finalState: z.object({
    passed: z.boolean(),
    summary: z.string().min(1),
  }),
});

export const syntheticLearnerEvalReportFormatSchema = z.enum(["json", "ndjson"]);

export const syntheticLearnerEvalReportMetadataSchema = z.object({
  format: syntheticLearnerEvalReportFormatSchema,
  artifactPath: z.string().min(1),
  generatedAt: z.string().datetime(),
  scenarioRunCount: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
});

export const syntheticLearnerEvalRunRecordSchema = z.object({
  id: idSchema,
  fixtureManifestId: idSchema,
  fixtureVersion: z.string().min(1),
  seededNotebookId: idSchema,
  status: syntheticLearnerRunStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  scenarioRuns: z.array(syntheticLearnerEvalScenarioRunSchema).min(1),
  notebookRefs: z.array(nodeRefSchema).default([]),
  reportMetadata: z.array(syntheticLearnerEvalReportMetadataSchema).default([]),
});

export const syntheticLearnerEvalMatrixSchema = z.object({
  fixture: evalSourceFixtureManifestSchema,
  personas: z.array(syntheticLearnerPersonaSchema).min(1),
  scenarios: z.array(syntheticLearnerScenarioSchema).min(1),
  runs: z.array(syntheticLearnerEvalRunSchema).min(1),
});

export type SyntheticLearnerMode = z.infer<typeof syntheticLearnerModeSchema>;
export type SyntheticLearnerLevel = z.infer<typeof syntheticLearnerLevelSchema>;
export type SyntheticLearnerSourceFamiliarity = z.infer<typeof syntheticLearnerSourceFamiliaritySchema>;
export type SyntheticLearnerResponsePolicy = z.infer<typeof syntheticLearnerResponsePolicySchema>;
export type SyntheticLearnerPersona = z.infer<typeof syntheticLearnerPersonaSchema>;
export type SyntheticLearnerScenarioKind = z.infer<typeof syntheticLearnerScenarioKindSchema>;
export type SyntheticLearnerScenarioBeatKind = z.infer<typeof syntheticLearnerScenarioBeatKindSchema>;
export type SyntheticLearnerAllowedAction = z.infer<typeof syntheticLearnerAllowedActionSchema>;
export type SyntheticLearnerStopCondition = z.infer<typeof syntheticLearnerStopConditionSchema>;
export type SyntheticLearnerAssertionReference = z.infer<typeof syntheticLearnerAssertionReferenceSchema>;
export type SyntheticLearnerScenarioBeat = z.infer<typeof syntheticLearnerScenarioBeatSchema>;
export type SyntheticLearnerScenario = z.infer<typeof syntheticLearnerScenarioSchema>;
export type EvalSourceFixtureCompatibilityStatus = z.infer<typeof evalSourceFixtureCompatibilityStatusSchema>;
export type EvalSourceFixtureGenerationMetadata = z.infer<typeof evalSourceFixtureGenerationMetadataSchema>;
export type EvalSourceFixtureReadinessCheck = z.infer<typeof evalSourceFixtureReadinessCheckSchema>;
export type EvalSourceFixtureExpectedCitation = z.infer<typeof evalSourceFixtureExpectedCitationSchema>;
export type EvalSourceFixtureManifest = z.infer<typeof evalSourceFixtureManifestSchema>;
export type SyntheticLearnerAssertionCategory = z.infer<typeof syntheticLearnerAssertionCategorySchema>;
export type SyntheticLearnerAssertion = z.infer<typeof syntheticLearnerAssertionSchema>;
export type SyntheticLearnerToolEvent = z.infer<typeof syntheticLearnerToolEventSchema>;
export type SyntheticLearnerRuntimeEvent = z.infer<typeof syntheticLearnerRuntimeEventSchema>;
export type SyntheticLearnerRunStatus = z.infer<typeof syntheticLearnerRunStatusSchema>;
export type SyntheticLearnerEvalRun = z.infer<typeof syntheticLearnerEvalRunSchema>;
export type SyntheticLearnerEvalStep = z.infer<typeof syntheticLearnerEvalStepSchema>;
export type SyntheticLearnerEvalScenarioRun = z.infer<typeof syntheticLearnerEvalScenarioRunSchema>;
export type SyntheticLearnerEvalReportFormat = z.infer<typeof syntheticLearnerEvalReportFormatSchema>;
export type SyntheticLearnerEvalReportMetadata = z.infer<typeof syntheticLearnerEvalReportMetadataSchema>;
export type SyntheticLearnerEvalRunRecord = z.infer<typeof syntheticLearnerEvalRunRecordSchema>;
export type SyntheticLearnerEvalMatrix = z.infer<typeof syntheticLearnerEvalMatrixSchema>;

export function renderSyntheticLearnerScriptedMessages(scenario: SyntheticLearnerScenario): string[] {
  return scenario.beats.map((beat) => beat.scriptedMessage);
}

export function renderSyntheticLearnerLivePrompt(input: {
  fixture: EvalSourceFixtureManifest;
  persona: SyntheticLearnerPersona;
  scenario: SyntheticLearnerScenario;
}): string {
  const { fixture, persona, scenario } = input;
  const lines = [
    `Synthetic learner eval fixture: ${fixture.id} (${fixture.version})`,
    `Persona: ${persona.name} [${persona.mode}]`,
    `Goal: ${persona.goalSummary}`,
    `Background: ${persona.backgroundSummary}`,
    `Learner level: ${persona.learnerLevel}`,
    `Source familiarity: ${persona.sourceFamiliarity}`,
    `Behaviors: ${persona.behaviors.join("; ")}`,
    `Misconceptions: ${persona.misconceptions.length ? persona.misconceptions.join("; ") : "none"}`,
    `Study habits: ${persona.studyHabits.join("; ")}`,
    `Response policy: tone=${persona.responsePolicy.tone}; brevity=${persona.responsePolicy.brevity}; mode=${persona.responsePolicy.mode}; askClarifyingQuestions=${persona.responsePolicy.askClarifyingQuestions}; referenceSourceMaterial=${persona.responsePolicy.referenceSourceMaterial}; stayInCharacter=${persona.responsePolicy.stayInCharacter}; constraints=${persona.responsePolicy.constraints.join("; ") || "none"}`,
    `Scenario: ${scenario.name} [${scenario.kind}]`,
    `Source fixture: ${scenario.sourceFixtureId}`,
    `Entry prompt: ${scenario.entryPrompt}`,
    `Objective: ${scenario.objectiveId ?? "none"}`,
    `Max turns: ${scenario.maxTurns}`,
    `Allowed actions: ${scenario.allowedActions.join(", ")}`,
    `Stop conditions: ${scenario.stopConditions.join(", ")}`,
    `Assertion refs: ${scenario.assertionRefs.map((ref) => ref.refId).join(", ") || "none"}`,
    "Beats:",
    ...scenario.beats.map(
      (beat, index) =>
        `${index + 1}. [${beat.kind}] ${beat.liveInstruction} | allowed=${beat.allowedActions.join(", ")} | stop=${beat.stopConditions.join(", ") || "none"}`,
    ),
  ];

  return lines.join("\n");
}

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

function deriveSyntheticLearnerEvalRunStatus(scenarioRuns: SyntheticLearnerEvalScenarioRun[]): SyntheticLearnerRunStatus {
  if (scenarioRuns.some((run) => run.status === "failed")) return "failed";
  if (scenarioRuns.some((run) => run.status === "running")) return "running";
  if (scenarioRuns.every((run) => run.status === "passed")) return "passed";
  if (scenarioRuns.every((run) => run.status === "skipped")) return "skipped";
  return "planned";
}

function deriveSyntheticLearnerEvalDurationMs(
  startedAt: string,
  completedAt: string | null | undefined,
  scenarioRuns: SyntheticLearnerEvalScenarioRun[],
): number | undefined {
  if (completedAt) {
    const duration = Date.parse(completedAt) - Date.parse(startedAt);
    if (Number.isFinite(duration) && duration >= 0) return duration;
  }

  const scenarioDurations = scenarioRuns.flatMap((run) => (typeof run.durationMs === "number" ? [run.durationMs] : []));
  if (!scenarioDurations.length) return undefined;
  return scenarioDurations.reduce((sum, duration) => sum + duration, 0);
}

export function buildSyntheticLearnerEvalRunRecord(input: {
  matrix: SyntheticLearnerEvalMatrix;
  scenarioRuns?: SyntheticLearnerEvalScenarioRun[];
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  artifactPath?: string;
  generatedAt?: string;
  format?: SyntheticLearnerEvalReportFormat;
  notebookRefs?: Array<{ refType: string; refId: string }>;
}): SyntheticLearnerEvalRunRecord {
  const runId = input.runId ?? `slrun_${input.matrix.fixture.id}_${input.matrix.personas.length}x${input.matrix.scenarios.length}`;
  const scenarioRuns = (input.scenarioRuns ?? input.matrix.runs.map((run) =>
    syntheticLearnerEvalScenarioRunSchema.parse({
      ...run,
      id: run.id,
      runId,
      fixtureVersion: input.matrix.fixture.version,
      steps: [],
      assertions: run.assertions,
      artifactRefs: run.artifactRefs,
      traceRefs: run.traceRefs,
      notebookRefs: [{ refType: "notebook", refId: run.seededNotebookId }],
      finalState: run.finalState,
    }),
  )) satisfies SyntheticLearnerEvalScenarioRun[];

  const startedAt = input.startedAt ?? input.matrix.fixture.generatedAt;
  const completedAt = input.completedAt ?? scenarioRuns
    .map((run) => run.completedAt)
    .find((value): value is string => Boolean(value));
  const status = deriveSyntheticLearnerEvalRunStatus(scenarioRuns);
  const durationMs = input.durationMs ?? deriveSyntheticLearnerEvalDurationMs(startedAt, completedAt, scenarioRuns);
  const notebookRefs = input.notebookRefs ?? [
    { refType: "notebook", refId: input.matrix.fixture.seededNotebookId },
  ];

  return syntheticLearnerEvalRunRecordSchema.parse({
    id: runId,
    fixtureManifestId: input.matrix.fixture.id,
    fixtureVersion: input.matrix.fixture.version,
    seededNotebookId: input.matrix.fixture.seededNotebookId,
    status,
    startedAt,
    completedAt,
    durationMs,
    scenarioRuns,
    notebookRefs,
    reportMetadata: [],
  });
}

export function exportSyntheticLearnerEvalRunReport(input: {
  run: SyntheticLearnerEvalRunRecord;
  format?: SyntheticLearnerEvalReportFormat;
  artifactPath?: string;
  generatedAt?: string;
}): SyntheticLearnerEvalRunRecord & { reportContent: string } {
  const run = syntheticLearnerEvalRunRecordSchema.parse(input.run);
  if (run.status === "planned" || run.status === "running") {
    throw new Error("Eval Run must be completed before exporting a report.");
  }

  const format = input.format ?? "json";
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const artifactPath = input.artifactPath ?? `eval-runs/${run.id}.${format === "ndjson" ? "ndjson" : "json"}`;
  const reportMetadata = syntheticLearnerEvalReportMetadataSchema.parse({
    format,
    artifactPath,
    generatedAt,
    scenarioRunCount: run.scenarioRuns.length,
    recordCount: format === "ndjson" ? 2 + run.scenarioRuns.length : 1,
  });

  const runWithMetadata = syntheticLearnerEvalRunRecordSchema.parse({
    ...run,
    reportMetadata: [...run.reportMetadata, reportMetadata],
  });

  const reportContent =
    format === "ndjson"
      ? [reportMetadata, runWithMetadata, ...runWithMetadata.scenarioRuns].map((record) => JSON.stringify(record)).join("\n")
      : JSON.stringify(
          {
            metadata: reportMetadata,
            run: runWithMetadata,
          },
          null,
          2,
        );

  return {
    ...runWithMetadata,
    reportContent,
  };
}
