import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";
import { learnerTraitValuesSchema } from "./learner-traits.js";

export const syntheticLearnerModeSchema = z.enum(["scripted", "beat_llm", "scenario_autonomous_llm", "full_autonomous_llm"]);
export const syntheticLearnerRunKindSchema = z.enum([
  "regression",
  "golden_journey",
  "scenario_autonomous",
  "full_autonomous",
  "scheduled",
]);
export const syntheticLearnerGatingPolicySchema = z.enum(["ci_gating", "non_ci_gating", "discovery_only"]);
export const syntheticLearnerAutonomyStartProfileSchema = z.enum(["naive_entry", "oriented_entry"]);

export const syntheticLearnerLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);

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
  traitArchetypeId: idSchema,
  traitValues: learnerTraitValuesSchema,
  backgroundSummary: z.string().min(1),
  goalSummary: z.string().min(1),
  learnerLevel: syntheticLearnerLevelSchema,
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
  "inspect_artifact",
  "answer_quiz",
  "give_artifact_feedback",
  "correct_mistake",
  "end_session",
]);

export const syntheticLearnerSimulatorActionSchema = z.enum([
  "chat.respond",
  "artifact.list",
  "artifact.view",
  "quiz.answer",
  "artifact.feedback",
  "session.finish",
]);

export const syntheticLearnerStopConditionSchema = z.enum([
  "turn_limit",
  "mastery_reached",
  "artifact_delivered",
  "session_concluded",
  "user_requests_stop",
  "invariant_failed",
]);

export const syntheticLearnerAssertionReferenceSchema = z.object({
  refType: z.literal("assertion"),
  refId: idSchema,
  label: z.string().min(1).optional(),
  required: z.boolean().optional(),
});

export const syntheticLearnerBrowserStepActionSchema = z.enum([
  "open_workspace",
  "open_source_wiki",
  "open_study_map",
  "open_artifact",
  "check_text",
  "check_absence",
  "take_screenshot",
]);

export const syntheticLearnerBrowserStepSchema = z.object({
  id: idSchema,
  action: syntheticLearnerBrowserStepActionSchema,
  target: z.enum(["workspace", "source_wiki", "study_map", "artifact", "eval_run"]),
  path: z.string().min(1),
  expectedText: z.string().min(1).optional(),
  absentText: z.string().min(1).optional(),
  screenshotRef: nodeRefSchema.optional(),
  assertionRefs: z.array(syntheticLearnerAssertionReferenceSchema).default([]),
});

export const syntheticLearnerAutonomousConfigSchema = z.object({
  enabled: z.boolean(),
  maxTurns: z.number().int().positive(),
  allowedProductSurfaces: z.array(z.enum(["tutor_chat", "workspace", "source_wiki", "study_map", "artifacts"])).min(1),
  invariantAssertionRefs: z.array(syntheticLearnerAssertionReferenceSchema).min(1),
  durableWritesScope: z.literal("eval_owned_notebooks"),
  gateStatus: syntheticLearnerGatingPolicySchema.default("discovery_only"),
});

export const syntheticLearnerModelConfigSchema = z.object({
  provider: z.enum(["openai_compatible", "stub"]).default("openai_compatible"),
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  maxActionRepairAttempts: z.number().int().min(0).max(10).default(2),
});

export const syntheticLearnerRubricDefinitionSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  qualitative: z.literal(true).default(true),
  dimensions: z.array(z.enum([
    "explanation_clarity",
    "remediation_quality",
    "artifact_usefulness",
    "source_faithfulness",
    "persona_realism",
  ])).min(1),
  enabled: z.boolean().default(false),
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
  runKind: syntheticLearnerRunKindSchema.default("regression"),
  sourceFixtureId: idSchema,
  personaIds: z.array(idSchema).min(1),
  beats: z.array(syntheticLearnerScenarioBeatSchema).min(1),
  browserSteps: z.array(syntheticLearnerBrowserStepSchema).default([]),
  autonomousConfig: syntheticLearnerAutonomousConfigSchema.optional(),
  rubricRefs: z.array(syntheticLearnerAssertionReferenceSchema).default([]),
  maxTurns: z.number().int().positive(),
  stopConditions: z.array(syntheticLearnerStopConditionSchema).min(1),
  allowedActions: z.array(syntheticLearnerAllowedActionSchema).min(1),
  assertionRefs: z.array(syntheticLearnerAssertionReferenceSchema).default([]),
  entryPrompt: z.string().min(1),
  objectiveId: idSchema.optional(),
});

export const evalSourceFixtureCompatibilityStatusSchema = z.enum(["compatible", "needs_regeneration", "blocked"]);
export const evalSourceFixtureFreshnessModeSchema = z.enum(["warn", "strict", "regenerate"]);
export const evalSourceFixtureFreshnessStatusSchema = z.enum(["fresh", "stale_warning", "stale_failure", "regenerated"]);

export const CURRENT_SYNTHETIC_LEARNER_EVAL_FIXTURE_VERSIONS = {
  ingestionPipelineVersion: "ingestion@2026.05.22",
  schemaVersion: "synthetic-learner-evals@1",
  modelProvider: "openrouter",
  modelName: "gpt-4.1",
} as const;

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

export const evalSourceFixtureFreshnessResultSchema = z.object({
  status: evalSourceFixtureFreshnessStatusSchema,
  mode: evalSourceFixtureFreshnessModeSchema,
  fresh: z.boolean(),
  importable: z.boolean(),
  reasons: z.array(z.string()).default([]),
  expected: z.object({
    ingestionPipelineVersion: z.string().min(1),
    schemaVersion: z.string().min(1),
    modelProvider: z.string().min(1),
    modelName: z.string().min(1),
    sourceContentHash: z.string().min(1).optional(),
  }),
  actual: z.object({
    ingestionPipelineVersion: z.string().min(1),
    schemaVersion: z.string().min(1),
    modelProvider: z.string().min(1),
    modelName: z.string().min(1),
    sourceContentHash: z.string().min(1),
    compatibilityStatus: evalSourceFixtureCompatibilityStatusSchema,
    compatible: z.boolean(),
  }),
});

export const syntheticLearnerAssertionCategorySchema = z.enum([
  "learner_visible",
  "runtime",
  "persistence",
  "report",
  "browser",
]);

export const syntheticLearnerRubricResultSchema = z.object({
  rubricId: idSchema,
  qualitative: z.literal(true),
  enabled: z.boolean(),
  status: z.enum(["scored", "skipped"]),
  score: z.number().min(0).max(1).nullable(),
  dimensionScores: z.record(z.string(), z.number().min(0).max(1)).default({}),
  summary: z.string().min(1),
  evidenceRefs: z.array(nodeRefSchema).default([]),
});

export const syntheticLearnerAssertionStatusSchema = z.enum(["passed", "failed", "skipped"]);

function normalizeSyntheticLearnerActionDecisionInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const parameters = input.parameters && typeof input.parameters === "object" && !Array.isArray(input.parameters)
    ? input.parameters as Record<string, unknown>
    : {};
  const rawAction = typeof input.action === "string" ? input.action : "";
  const query = typeof parameters.query === "string"
    ? parameters.query
    : typeof parameters.message === "string"
      ? parameters.message
      : typeof input.learnerMessage === "string"
        ? input.learnerMessage
        : undefined;
  const artifactId = typeof input.artifactId === "string"
    ? input.artifactId
    : typeof parameters.artifactId === "string"
      ? parameters.artifactId
      : undefined;

  const actionAliases: Record<string, z.infer<typeof syntheticLearnerSimulatorActionSchema>> = {
    ask_question: "chat.respond",
    answer_question: "chat.respond",
    request_hint: "chat.respond",
    request_summary: "chat.respond",
    request_artifact: "chat.respond",
    correct_mistake: "chat.respond",
    end_session: "session.finish",
    inspect_artifact: "artifact.view",
    view_artifact: "artifact.view",
    list_artifacts: "artifact.list",
    answer_quiz: "quiz.answer",
    give_artifact_feedback: "artifact.feedback",
  };
  const normalizedAction = actionAliases[rawAction] ?? rawAction;

  return {
    ...input,
    ...parameters,
    action: normalizedAction,
    rationale: typeof input.rationale === "string"
      ? input.rationale
      : `Synthetic Learner selected ${String(normalizedAction || rawAction || "an action")}.`,
    ...(query && normalizedAction === "chat.respond" ? { learnerMessage: query } : {}),
    ...(artifactId ? { artifactId } : {}),
  };
}

export const syntheticLearnerActionDecisionSchema = z.preprocess(normalizeSyntheticLearnerActionDecisionInput, z.object({
  action: syntheticLearnerSimulatorActionSchema,
  rationale: z.string().min(1),
  learnerMessage: z.string().min(1).optional(),
  artifactId: idSchema.optional(),
  questionId: idSchema.optional(),
  answer: z.string().min(1).optional(),
  isCorrect: z.boolean().optional(),
  score: z.number().min(0).max(1).optional(),
  conceptIds: z.array(idSchema).default([]),
  explanation: z.string().min(1).optional(),
  usefulness: z.enum(["useful", "not_useful", "mixed"]).optional(),
  difficulty: z.enum(["too_easy", "right_level", "too_hard"]).optional(),
  confusion: z.string().min(1).optional(),
  sourceGrounding: z.enum(["grounded", "ungrounded", "unclear"]).optional(),
  finishReason: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.action === "chat.respond" && !value.learnerMessage) {
    ctx.addIssue({ code: "custom", path: ["learnerMessage"], message: "chat.respond requires learnerMessage." });
  }
  if (value.action === "artifact.view" && !value.artifactId) {
    ctx.addIssue({ code: "custom", path: ["artifactId"], message: "artifact.view requires artifactId." });
  }
  if (value.action === "quiz.answer" && (!value.artifactId || !value.questionId || !value.answer)) {
    ctx.addIssue({ code: "custom", path: ["quiz.answer"], message: "quiz.answer requires artifactId, questionId, and answer." });
  }
}));

export const syntheticLearnerActionObservationSchema = z.object({
  action: syntheticLearnerSimulatorActionSchema,
  status: z.enum(["ok", "failed", "finished"]),
  summary: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
  evidenceRefs: z.array(nodeRefSchema).default([]),
});

export const syntheticLearnerLearnerResponseSchema = z.object({
  learnerFacingText: z.string().min(1).optional(),
  finish: z.boolean().default(false),
  finishReason: z.string().min(1).optional(),
  internalRationale: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.finish && !value.learnerFacingText) {
    ctx.addIssue({ code: "custom", path: ["learnerFacingText"], message: "learnerFacingText is required unless finish is true." });
  }
});

export const syntheticLearnerSimulatorEvidenceSchema = z.object({
  eventType: z.enum(["model_output_invalid", "action_repaired", "action_failed", "observation_recorded"]),
  learnerMode: syntheticLearnerModeSchema,
  message: z.string().min(1),
  rawModelOutput: z.string().optional(),
  repairAttempt: z.number().int().nonnegative().optional(),
  schemaFeedback: z.string().optional(),
  timestamp: z.string().datetime(),
});

export const syntheticLearnerEvalIssueCandidateSchema = z.object({
  title: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  learnerMode: syntheticLearnerModeSchema,
  runKind: syntheticLearnerRunKindSchema,
  personaId: idSchema,
  scenarioId: idSchema.optional(),
  autonomyStartProfile: syntheticLearnerAutonomyStartProfileSchema.optional(),
  fixtureManifestId: idSchema,
  fixtureVersion: z.string().min(1),
  seededNotebookId: idSchema,
  failureSummary: z.string().min(1),
  transcriptExcerpt: z.array(z.string().min(1)).min(1),
  evidenceRefs: z.array(nodeRefSchema).default([]),
  traceRefs: z.array(nodeRefSchema).default([]),
  artifactRefs: z.array(nodeRefSchema).default([]),
  reproductionCommand: z.string().min(1),
  publishedIssueUrl: z.string().url().optional(),
});

const syntheticLearnerAssertionBaseSchema = z.object({
  id: idSchema,
  category: syntheticLearnerAssertionCategorySchema,
  description: z.string().min(1),
  status: syntheticLearnerAssertionStatusSchema.default("passed"),
  passed: z.boolean().optional(),
  failureMessage: z.string().min(1).optional(),
  evidenceRefs: z.array(nodeRefSchema).default([]),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const syntheticLearnerAssertionSchema = syntheticLearnerAssertionBaseSchema.transform((value) => ({
  ...value,
  passed: value.status === "passed",
}));

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
  runKind: syntheticLearnerRunKindSchema.default("regression"),
  learnerMode: syntheticLearnerModeSchema.default("scripted"),
  simulatorModel: syntheticLearnerModelConfigSchema.optional(),
  autonomyStartProfile: syntheticLearnerAutonomyStartProfileSchema.optional(),
  gatingPolicy: syntheticLearnerGatingPolicySchema.default("ci_gating"),
  actionRepairAttempts: z.number().int().nonnegative().default(0),
  simulatorEvidence: z.array(syntheticLearnerSimulatorEvidenceSchema).default([]),
  issueCandidates: z.array(syntheticLearnerEvalIssueCandidateSchema).default([]),
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
  "browser",
  "rubric",
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
  screenshotRefs: z.array(nodeRefSchema).default([]),
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
  screenshotRefs: z.array(nodeRefSchema).default([]),
  traceRefs: z.array(nodeRefSchema).default([]),
  notebookRefs: z.array(nodeRefSchema).default([]),
  runKind: syntheticLearnerRunKindSchema.default("regression"),
  learnerMode: syntheticLearnerModeSchema.default("scripted"),
  simulatorModel: syntheticLearnerModelConfigSchema.optional(),
  autonomyStartProfile: syntheticLearnerAutonomyStartProfileSchema.optional(),
  gatingPolicy: syntheticLearnerGatingPolicySchema.default("ci_gating"),
  actionRepairAttempts: z.number().int().nonnegative().default(0),
  simulatorEvidence: z.array(syntheticLearnerSimulatorEvidenceSchema).default([]),
  issueCandidates: z.array(syntheticLearnerEvalIssueCandidateSchema).default([]),
  rubricResults: z.array(syntheticLearnerRubricResultSchema).default([]),
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
  transcript: z.array(z.string().min(1)).default([]),
  scenarioRuns: z.array(syntheticLearnerEvalScenarioRunSchema).min(1),
  notebookRefs: z.array(nodeRefSchema).default([]),
  rubricResults: z.array(syntheticLearnerRubricResultSchema).default([]),
  reportMetadata: z.array(syntheticLearnerEvalReportMetadataSchema).default([]),
  issueCandidates: z.array(syntheticLearnerEvalIssueCandidateSchema).default([]),
});

export const syntheticLearnerEvalMatrixSchema = z.object({
  fixture: evalSourceFixtureManifestSchema,
  personas: z.array(syntheticLearnerPersonaSchema).min(1),
  scenarios: z.array(syntheticLearnerScenarioSchema).min(1),
  runs: z.array(syntheticLearnerEvalRunSchema).min(1),
});

export type SyntheticLearnerMode = z.infer<typeof syntheticLearnerModeSchema>;
export type SyntheticLearnerRunKind = z.infer<typeof syntheticLearnerRunKindSchema>;
export type SyntheticLearnerGatingPolicy = z.infer<typeof syntheticLearnerGatingPolicySchema>;
export type SyntheticLearnerAutonomyStartProfile = z.infer<typeof syntheticLearnerAutonomyStartProfileSchema>;
export type SyntheticLearnerLevel = z.infer<typeof syntheticLearnerLevelSchema>;
export type SyntheticLearnerResponsePolicy = z.infer<typeof syntheticLearnerResponsePolicySchema>;
export type SyntheticLearnerPersona = z.infer<typeof syntheticLearnerPersonaSchema>;
export type SyntheticLearnerScenarioKind = z.infer<typeof syntheticLearnerScenarioKindSchema>;
export type SyntheticLearnerScenarioBeatKind = z.infer<typeof syntheticLearnerScenarioBeatKindSchema>;
export type SyntheticLearnerAllowedAction = z.infer<typeof syntheticLearnerAllowedActionSchema>;
export type SyntheticLearnerSimulatorAction = z.infer<typeof syntheticLearnerSimulatorActionSchema>;
export type SyntheticLearnerStopCondition = z.infer<typeof syntheticLearnerStopConditionSchema>;
export type SyntheticLearnerAssertionReference = z.infer<typeof syntheticLearnerAssertionReferenceSchema>;
export type SyntheticLearnerBrowserStepAction = z.infer<typeof syntheticLearnerBrowserStepActionSchema>;
export type SyntheticLearnerBrowserStep = z.infer<typeof syntheticLearnerBrowserStepSchema>;
export type SyntheticLearnerAutonomousConfig = z.infer<typeof syntheticLearnerAutonomousConfigSchema>;
export type SyntheticLearnerModelConfig = z.infer<typeof syntheticLearnerModelConfigSchema>;
export type SyntheticLearnerRubricDefinition = z.infer<typeof syntheticLearnerRubricDefinitionSchema>;
export type SyntheticLearnerScenarioBeat = z.infer<typeof syntheticLearnerScenarioBeatSchema>;
export type SyntheticLearnerScenario = z.infer<typeof syntheticLearnerScenarioSchema>;
export type EvalSourceFixtureCompatibilityStatus = z.infer<typeof evalSourceFixtureCompatibilityStatusSchema>;
export type EvalSourceFixtureFreshnessMode = z.infer<typeof evalSourceFixtureFreshnessModeSchema>;
export type EvalSourceFixtureFreshnessStatus = z.infer<typeof evalSourceFixtureFreshnessStatusSchema>;
export type EvalSourceFixtureGenerationMetadata = z.infer<typeof evalSourceFixtureGenerationMetadataSchema>;
export type EvalSourceFixtureReadinessCheck = z.infer<typeof evalSourceFixtureReadinessCheckSchema>;
export type EvalSourceFixtureExpectedCitation = z.infer<typeof evalSourceFixtureExpectedCitationSchema>;
export type EvalSourceFixtureManifest = z.infer<typeof evalSourceFixtureManifestSchema>;
export type EvalSourceFixtureFreshnessResult = z.infer<typeof evalSourceFixtureFreshnessResultSchema>;
export type SyntheticLearnerAssertionCategory = z.infer<typeof syntheticLearnerAssertionCategorySchema>;
export type SyntheticLearnerRubricResult = z.infer<typeof syntheticLearnerRubricResultSchema>;
export type SyntheticLearnerAssertionStatus = z.infer<typeof syntheticLearnerAssertionStatusSchema>;
export type SyntheticLearnerActionDecision = z.infer<typeof syntheticLearnerActionDecisionSchema>;
export type SyntheticLearnerActionObservation = z.infer<typeof syntheticLearnerActionObservationSchema>;
export type SyntheticLearnerLearnerResponse = z.infer<typeof syntheticLearnerLearnerResponseSchema>;
export type SyntheticLearnerSimulatorEvidence = z.infer<typeof syntheticLearnerSimulatorEvidenceSchema>;
export type SyntheticLearnerEvalIssueCandidate = z.infer<typeof syntheticLearnerEvalIssueCandidateSchema>;
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

export function formatSyntheticLearnerList(items: string[], separator: string): string {
  return items.length ? items.join(separator) : "none";
}

export function renderSyntheticLearnerScriptedMessages(scenario: SyntheticLearnerScenario): string[] {
  return scenario.beats.map((beat) => beat.scriptedMessage);
}

export function renderSyntheticLearnerLivePrompt(input: {
  fixture: EvalSourceFixtureManifest;
  persona: SyntheticLearnerPersona;
  scenario: SyntheticLearnerScenario;
}): string {
  const { fixture, persona, scenario } = input;
  const responsePolicySummary = [
    `tone=${persona.responsePolicy.tone}`,
    `brevity=${persona.responsePolicy.brevity}`,
    `mode=${persona.responsePolicy.mode}`,
    `askClarifyingQuestions=${persona.responsePolicy.askClarifyingQuestions}`,
    `referenceSourceMaterial=${persona.responsePolicy.referenceSourceMaterial}`,
    `stayInCharacter=${persona.responsePolicy.stayInCharacter}`,
    `constraints=${formatSyntheticLearnerList(persona.responsePolicy.constraints, "; ")}`,
  ].join("; ");

  const beatSummary = scenario.beats.map(
    (beat, index) =>
      `${index + 1}. [${beat.kind}] ${beat.liveInstruction} | allowed=${beat.allowedActions.join(", ")} | stop=${formatSyntheticLearnerList(beat.stopConditions, ", ")}`,
  );

  const lines = [
    `Synthetic learner eval fixture: ${fixture.id} (${fixture.version})`,
    `Persona: ${persona.name} [${persona.mode}]`,
    `Goal: ${persona.goalSummary}`,
    `Background: ${persona.backgroundSummary}`,
    `Learner level: ${persona.learnerLevel}`,
    `Trait archetype: ${persona.traitArchetypeId}`,
    `Trait values: ${JSON.stringify(persona.traitValues)}`,
    `Behaviors: ${persona.behaviors.join("; ")}`,
    `Misconceptions: ${persona.misconceptions.length ? persona.misconceptions.join("; ") : "none"}`,
    `Study habits: ${persona.studyHabits.join("; ")}`,
    `Response policy: ${responsePolicySummary}`,
    `Scenario: ${scenario.name} [${scenario.kind}]`,
    `Source fixture: ${scenario.sourceFixtureId}`,
    `Entry prompt: ${scenario.entryPrompt}`,
    `Objective: ${scenario.objectiveId ?? "none"}`,
    `Max turns: ${scenario.maxTurns}`,
    `Allowed actions: ${scenario.allowedActions.join(", ")}`,
    `Stop conditions: ${scenario.stopConditions.join(", ")}`,
    `Assertion refs: ${scenario.assertionRefs.map((ref) => ref.refId).join(", ") || "none"}`,
    "Beats:",
    ...beatSummary,
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
      runKind: scenario.runKind,
      learnerMode: "scripted" as const,
      gatingPolicy: "ci_gating" as const,
      actionRepairAttempts: 0,
      simulatorEvidence: [],
      issueCandidates: [],
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

export function evaluateEvalSourceFixtureFreshness(input: {
  fixture: EvalSourceFixtureManifest;
  mode?: EvalSourceFixtureFreshnessMode;
  expected?: Partial<{
    ingestionPipelineVersion: string;
    schemaVersion: string;
    modelProvider: string;
    modelName: string;
    sourceContentHash: string;
  }>;
}): EvalSourceFixtureFreshnessResult {
  const mode = input.mode ?? "warn";
  const expected = {
    ...CURRENT_SYNTHETIC_LEARNER_EVAL_FIXTURE_VERSIONS,
    ...(input.expected ?? {}),
  };
  const fixture = input.fixture;
  const reasons: string[] = [];

  if (fixture.ingestionPipelineVersion !== expected.ingestionPipelineVersion) {
    reasons.push(`ingestion pipeline version ${fixture.ingestionPipelineVersion} does not match ${expected.ingestionPipelineVersion}`);
  }
  if (fixture.generationMetadata.pipelineVersion !== expected.ingestionPipelineVersion) {
    reasons.push(`generation metadata pipeline version ${fixture.generationMetadata.pipelineVersion} does not match ${expected.ingestionPipelineVersion}`);
  }
  if (fixture.schemaVersion !== expected.schemaVersion) {
    reasons.push(`schema version ${fixture.schemaVersion} does not match ${expected.schemaVersion}`);
  }
  if (fixture.generationMetadata.schemaVersion !== expected.schemaVersion) {
    reasons.push(`generation metadata schema version ${fixture.generationMetadata.schemaVersion} does not match ${expected.schemaVersion}`);
  }
  if (fixture.generationMetadata.modelProvider !== expected.modelProvider) {
    reasons.push(`model provider ${fixture.generationMetadata.modelProvider} does not match ${expected.modelProvider}`);
  }
  if (fixture.generationMetadata.modelName !== expected.modelName) {
    reasons.push(`model name ${fixture.generationMetadata.modelName} does not match ${expected.modelName}`);
  }
  if (expected.sourceContentHash && fixture.sourceContentHash !== expected.sourceContentHash) {
    reasons.push(`source content hash ${fixture.sourceContentHash} does not match ${expected.sourceContentHash}`);
  }
  if (fixture.compatibilityStatus !== "compatible" || !fixture.compatible) {
    reasons.push(`fixture compatibility is ${fixture.compatibilityStatus}`);
  }
  for (const check of fixture.readinessChecks) {
    if (!check.passed) {
      reasons.push(`readiness check failed: ${check.id}`);
    }
  }

  const fresh = reasons.length === 0;
  const status: EvalSourceFixtureFreshnessStatus = fresh
    ? "fresh"
    : mode === "regenerate"
      ? "regenerated"
      : mode === "strict"
        ? "stale_failure"
        : "stale_warning";

  return evalSourceFixtureFreshnessResultSchema.parse({
    status,
    mode,
    fresh,
    importable: fresh || mode === "warn" || mode === "regenerate",
    reasons,
    expected,
    actual: {
      ingestionPipelineVersion: fixture.ingestionPipelineVersion,
      schemaVersion: fixture.schemaVersion,
      modelProvider: fixture.generationMetadata.modelProvider,
      modelName: fixture.generationMetadata.modelName,
      sourceContentHash: fixture.sourceContentHash,
      compatibilityStatus: fixture.compatibilityStatus,
      compatible: fixture.compatible,
    },
  });
}

export function regenerateEvalSourceFixtureManifest(input: {
  fixture: EvalSourceFixtureManifest;
  generatedAt?: string;
  generatedBy?: string;
  sourceContentHash?: string;
  ingestionPipelineVersion?: string;
  schemaVersion?: string;
  modelProvider?: string;
  modelName?: string;
  notes?: string;
}): EvalSourceFixtureManifest {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const ingestionPipelineVersion = input.ingestionPipelineVersion ?? CURRENT_SYNTHETIC_LEARNER_EVAL_FIXTURE_VERSIONS.ingestionPipelineVersion;
  const schemaVersion = input.schemaVersion ?? CURRENT_SYNTHETIC_LEARNER_EVAL_FIXTURE_VERSIONS.schemaVersion;
  const modelProvider = input.modelProvider ?? CURRENT_SYNTHETIC_LEARNER_EVAL_FIXTURE_VERSIONS.modelProvider;
  const modelName = input.modelName ?? CURRENT_SYNTHETIC_LEARNER_EVAL_FIXTURE_VERSIONS.modelName;
  const sourceContentHash = input.sourceContentHash ?? input.fixture.sourceContentHash;

  return evalSourceFixtureManifestSchema.parse({
    ...input.fixture,
    sourceContentHash,
    generationMetadata: {
      ...input.fixture.generationMetadata,
      generatedBy: input.generatedBy ?? input.fixture.generationMetadata.generatedBy,
      pipelineVersion: ingestionPipelineVersion,
      schemaVersion,
      generatedAt,
      modelProvider,
      modelName,
    },
    compatibilityStatus: "compatible",
    ingestionPipelineVersion,
    schemaVersion,
    generatedAt,
    compatible: true,
    notes: input.notes ?? `Regenerated from ${input.fixture.id}@${input.fixture.version}.`,
  });
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
  transcript?: string[];
  artifactPath?: string;
  generatedAt?: string;
  format?: SyntheticLearnerEvalReportFormat;
  notebookRefs?: Array<{ refType: string; refId: string }>;
  rubricResults?: SyntheticLearnerRubricResult[];
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
      runKind: input.matrix.scenarios.find((scenario) => scenario.id === run.scenarioId)?.runKind ?? "regression",
      learnerMode: run.learnerMode ?? "scripted",
      simulatorModel: run.simulatorModel,
      autonomyStartProfile: run.autonomyStartProfile,
      gatingPolicy: run.gatingPolicy ?? "ci_gating",
      actionRepairAttempts: run.actionRepairAttempts ?? 0,
      simulatorEvidence: run.simulatorEvidence ?? [],
      issueCandidates: run.issueCandidates ?? [],
      rubricResults: [],
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
    transcript: input.transcript ?? [],
    scenarioRuns,
    notebookRefs,
    rubricResults: input.rubricResults ?? scenarioRuns.flatMap((scenarioRun) => scenarioRun.rubricResults),
    reportMetadata: [],
    issueCandidates: scenarioRuns.flatMap((scenarioRun) => scenarioRun.issueCandidates ?? []),
  });
}

export function buildSkippedSyntheticLearnerRubricResults(input: {
  definitions: SyntheticLearnerRubricDefinition[];
  evidenceRefs?: Array<{ refType: string; refId: string }>;
}): SyntheticLearnerRubricResult[] {
  return input.definitions.map((definition) => syntheticLearnerRubricResultSchema.parse({
    rubricId: definition.id,
    qualitative: true,
    enabled: definition.enabled,
    status: "skipped",
    score: null,
    dimensionScores: {},
    summary: definition.enabled
      ? "Qualitative rubric was enabled but no LLM judge result was provided."
      : "Qualitative rubric is disabled for this run.",
    evidenceRefs: input.evidenceRefs ?? [],
  }));
}

export function deriveDeterministicGateStatus(input: {
  scenarioRuns: SyntheticLearnerEvalScenarioRun[];
}): SyntheticLearnerRunStatus {
  return deriveSyntheticLearnerEvalRunStatus(input.scenarioRuns);
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
