import { z } from "zod";
import { idSchema, nodeRefSchema, type NodeRef } from "./ids.js";
import type {
  SyntheticLearnerAssertionPersistenceEvidence,
  SyntheticLearnerForbiddenProductStateSnapshot,
} from "./synthetic-learner-evals-persistence-types.js";
import type { SyntheticLearnerAssertionReference } from "./synthetic-learner-evals.js";

export const evalEvidenceSnapshotCategorySchema = z.enum([
  "mastery_evidence",
  "artifacts",
  "quiz_attempts",
  "session_lifecycle",
  "tutor_turns",
  "tool_calls",
  "learner_trait_signals",
  "learner_trait_estimates",
  "workspace_reference_surfaces",
  "notebook_events",
]);

export const evalEvidenceSnapshotCategoryStatusSchema = z.enum(["available", "missing", "skipped"]);

export const evalEvidenceSnapshotCategoryRecordSchema = z.object({
  category: evalEvidenceSnapshotCategorySchema,
  status: evalEvidenceSnapshotCategoryStatusSchema,
  required: z.boolean(),
  skipReason: z.string().min(1).optional(),
  refs: z.array(nodeRefSchema).default([]),
});

export const persistedEvalNotebookStateSchema = z.object({
  notebookId: idSchema,
  masteryEvidence: z
    .array(
      z.object({
        id: idSchema,
        turnId: idSchema.optional(),
        sessionId: idSchema.optional(),
        correctnessLabel: z.string().optional(),
        overallScore: z.number().optional(),
        confidence: z.number().optional(),
        triggerSource: z.string().optional(),
      }),
    )
    .default([]),
  artifacts: z.array(z.object({ id: idSchema, status: z.string().min(1) })).default([]),
  quizAttempts: z.array(z.object({ id: idSchema, artifactId: idSchema.optional() })).default([]),
  sessionEvents: z
    .array(
      z.object({
        id: idSchema.optional(),
        eventType: z.string().min(1),
        sessionId: idSchema.optional(),
        timestamp: z.string().datetime().optional(),
      }),
    )
    .default([]),
  tutorTurns: z
    .array(
      z.object({
        id: idSchema,
        sessionId: idSchema,
        timestamp: z.string().datetime().optional(),
      }),
    )
    .default([]),
  toolCalls: z
    .array(
      z.object({
        id: idSchema,
        toolName: z.string().min(1),
        sessionId: idSchema.optional(),
        turnId: idSchema.optional(),
      }),
    )
    .default([]),
  learnerTraitSignals: z.array(z.object({ id: idSchema })).default([]),
  learnerTraitEstimates: z.array(z.object({ id: idSchema })).default([]),
  workspaceReferenceSurfaces: z.array(nodeRefSchema).default([]),
  notebookEvents: z
    .array(
      z.object({
        id: idSchema,
        eventType: z.string().min(1),
        sessionId: idSchema.optional(),
        timestamp: z.string().datetime().optional(),
      }),
    )
    .default([]),
  sources: z
    .array(
      z.object({
        id: idSchema,
        status: z.string().min(1),
        tutoringReady: z.boolean().default(false),
        wikiReady: z.boolean().default(false),
        graphReady: z.boolean().default(false),
      }),
    )
    .default([]),
  objectives: z.array(z.object({ id: idSchema, status: z.string().min(1) })).default([]),
  studyPlans: z.array(z.object({ id: idSchema, status: z.string().min(1) })).default([]),
  explicitLearnerGoals: z
    .array(
      z.object({
        refType: z.literal("notebook"),
        refId: idSchema,
        summary: z.string().min(1),
      }),
    )
    .default([]),
  learningStates: z
    .array(
      z.object({
        conceptId: idSchema,
        masteryScore: z.number().optional(),
      }),
    )
    .default([]),
  weakConceptIds: z.array(idSchema).default([]),
  curricula: z.array(z.object({ id: idSchema, status: z.string().min(1) })).default([]),
  curriculumModules: z.array(z.object({ id: idSchema, status: z.string().min(1) })).default([]),
  personalizationRecommendations: z
    .array(z.object({ id: idSchema, trait: z.string().min(1) }))
    .default([]),
});

export const evalEvidenceSnapshotSchema = z.object({
  id: idSchema,
  capturedAt: z.string().datetime(),
  notebookId: idSchema,
  categories: z.array(evalEvidenceSnapshotCategoryRecordSchema),
  snapshotRefs: z.array(nodeRefSchema).default([]),
  objectives: persistedEvalNotebookStateSchema.shape.objectives.optional(),
  studyPlans: persistedEvalNotebookStateSchema.shape.studyPlans.optional(),
  artifactsMeta: persistedEvalNotebookStateSchema.shape.artifacts.optional(),
  explicitLearnerGoals: persistedEvalNotebookStateSchema.shape.explicitLearnerGoals.optional(),
  readinessStates: z
    .array(
      z.object({
        sourceId: idSchema,
        tutoringReady: z.boolean(),
        wikiReady: z.boolean(),
        graphReady: z.boolean(),
      }),
    )
    .optional(),
  learningStates: persistedEvalNotebookStateSchema.shape.learningStates.optional(),
  weakConceptIds: persistedEvalNotebookStateSchema.shape.weakConceptIds.optional(),
  curricula: persistedEvalNotebookStateSchema.shape.curricula.optional(),
  curriculumModules: persistedEvalNotebookStateSchema.shape.curriculumModules.optional(),
  personalizationRecommendations:
    persistedEvalNotebookStateSchema.shape.personalizationRecommendations.optional(),
  traitRecommendationOnlySnapshot: z
    .object({
      before: z.custom<SyntheticLearnerForbiddenProductStateSnapshot>(),
      after: z.custom<SyntheticLearnerForbiddenProductStateSnapshot>(),
    })
    .optional(),
  sessionEventRecords: z
    .array(
      z.object({
        ref: nodeRefSchema.optional(),
        eventType: z.string().min(1),
        timestamp: z.string().datetime().optional(),
      }),
    )
    .optional(),
});

export type EvalEvidenceSnapshotCategory = z.infer<typeof evalEvidenceSnapshotCategorySchema>;
export type EvalEvidenceSnapshotCategoryRecord = z.infer<
  typeof evalEvidenceSnapshotCategoryRecordSchema
>;
export type EvalEvidenceSnapshot = z.infer<typeof evalEvidenceSnapshotSchema>;
export type PersistedEvalNotebookState = z.infer<typeof persistedEvalNotebookStateSchema>;

export type BuildEvalEvidenceSnapshotInput = {
  id: string;
  notebookId: string;
  capturedAt?: string;
  masteryEvidence?: NonNullable<SyntheticLearnerAssertionPersistenceEvidence["masteryEvidence"]>;
  artifacts?: NonNullable<SyntheticLearnerAssertionPersistenceEvidence["artifacts"]>;
  quizAttempts?: Array<{ ref: NodeRef }>;
  sessionEvents?: NonNullable<SyntheticLearnerAssertionPersistenceEvidence["sessionEvents"]>;
  tutorTurns?: Array<{ ref: NodeRef }>;
  toolCalls?: Array<{ ref: NodeRef }>;
  learnerTraitSignals?: Array<{ ref: NodeRef }>;
  learnerTraitEstimates?: Array<{ ref: NodeRef }>;
  workspaceReferenceSurfaces?: Array<{ ref: NodeRef }>;
  notebookEvents?: Array<{ ref?: NodeRef; eventType: string; timestamp?: string }>;
  traitRecommendationOnlySnapshot?: SyntheticLearnerAssertionPersistenceEvidence["traitRecommendationOnlySnapshot"];
  requiredCategories?: EvalEvidenceSnapshotCategory[];
  objectives?: PersistedEvalNotebookState["objectives"];
  studyPlans?: PersistedEvalNotebookState["studyPlans"];
  explicitLearnerGoals?: PersistedEvalNotebookState["explicitLearnerGoals"];
  readinessStates?: NonNullable<EvalEvidenceSnapshot["readinessStates"]>;
  learningStates?: PersistedEvalNotebookState["learningStates"];
  weakConceptIds?: PersistedEvalNotebookState["weakConceptIds"];
  curricula?: PersistedEvalNotebookState["curricula"];
  curriculumModules?: PersistedEvalNotebookState["curriculumModules"];
  personalizationRecommendations?: PersistedEvalNotebookState["personalizationRecommendations"];
};

const DEFAULT_REQUIRED_CATEGORIES: EvalEvidenceSnapshotCategory[] = ["mastery_evidence"];

const PERSISTENCE_ASSERTION_REQUIRED_CATEGORIES: Record<string, EvalEvidenceSnapshotCategory[]> = {
  persistence_conservative_movement: ["mastery_evidence"],
  persistence_artifact_status: ["artifacts"],
  persistence_crystallization_boundary: ["session_lifecycle"],
  persistence_trait_estimates: [
    "session_lifecycle",
    "learner_trait_signals",
    "learner_trait_estimates",
  ],
  persistence_trait_recommendation_only: ["learner_trait_estimates"],
  persistence_trait_no_mastery_mutation: ["learner_trait_estimates"],
};

export function requiredSnapshotCategoriesForAssertionRefs(
  assertionRefs: SyntheticLearnerAssertionReference[],
): EvalEvidenceSnapshotCategory[] {
  return [
    ...new Set(
      assertionRefs.flatMap((ref) => PERSISTENCE_ASSERTION_REQUIRED_CATEGORIES[ref.refId] ?? []),
    ),
  ];
}

export function captureEvalEvidenceSnapshotFromPersistedState(input: {
  snapshotId: string;
  notebookId: string;
  capturedAt?: string;
  state: PersistedEvalNotebookState;
  requiredCategories?: EvalEvidenceSnapshotCategory[];
}): EvalEvidenceSnapshot {
  const state = persistedEvalNotebookStateSchema.parse(input.state);
  return buildEvalEvidenceSnapshot({
    id: input.snapshotId,
    notebookId: input.notebookId,
    ...(input.capturedAt ? { capturedAt: input.capturedAt } : {}),
    ...(input.requiredCategories ? { requiredCategories: input.requiredCategories } : {}),
    masteryEvidence: state.masteryEvidence.map((entry) => ({
      ref: entry.turnId
        ? { refType: "turn" as const, refId: entry.turnId }
        : entry.sessionId
          ? { refType: "session" as const, refId: entry.sessionId }
          : { refType: "turn" as const, refId: entry.id },
      ...(entry.correctnessLabel ? { correctnessLabel: entry.correctnessLabel } : {}),
      ...(typeof entry.overallScore === "number" ? { overallScore: entry.overallScore } : {}),
      ...(typeof entry.confidence === "number" ? { confidence: entry.confidence } : {}),
      ...(entry.triggerSource ? { triggerSource: entry.triggerSource } : {}),
    })),
    artifacts: state.artifacts.map((entry) => ({
      ref: { refType: "artifact", refId: entry.id },
      status: entry.status,
    })),
    quizAttempts: state.quizAttempts.map((entry) => ({
      ref: { refType: "turn", refId: entry.id },
    })),
    sessionEvents: state.sessionEvents.map((entry) => ({
      ref: entry.sessionId
        ? { refType: "session" as const, refId: entry.sessionId }
        : { refType: "notebook" as const, refId: state.notebookId },
      eventType: entry.eventType,
      ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
    })),
    tutorTurns: state.tutorTurns.map((entry) => ({ ref: { refType: "turn", refId: entry.id } })),
    toolCalls: state.toolCalls.map((entry) => ({ ref: { refType: "tool_call", refId: entry.id } })),
    learnerTraitSignals: state.learnerTraitSignals.map((entry) => ({
      ref: { refType: "trait_signal", refId: entry.id },
    })),
    learnerTraitEstimates: state.learnerTraitEstimates.map((entry) => ({
      ref: { refType: "trait_estimate", refId: entry.id },
    })),
    workspaceReferenceSurfaces: state.workspaceReferenceSurfaces.map((ref) => ({ ref })),
    notebookEvents: state.notebookEvents.map((entry) => ({
      ref: { refType: "notebook", refId: state.notebookId },
      eventType: entry.eventType,
      ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
    })),
    objectives: state.objectives,
    studyPlans: state.studyPlans,
    explicitLearnerGoals: state.explicitLearnerGoals,
    readinessStates: state.sources.map((source) => ({
      sourceId: source.id,
      tutoringReady: source.tutoringReady,
      wikiReady: source.wikiReady,
      graphReady: source.graphReady,
    })),
    learningStates: state.learningStates,
    weakConceptIds: state.weakConceptIds,
    curricula: state.curricula,
    curriculumModules: state.curriculumModules,
    personalizationRecommendations: state.personalizationRecommendations,
  });
}

export function buildEvalEvidenceSnapshot(
  input: BuildEvalEvidenceSnapshotInput,
): EvalEvidenceSnapshot {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const requiredCategories = new Set(input.requiredCategories ?? DEFAULT_REQUIRED_CATEGORIES);
  const categories: EvalEvidenceSnapshotCategoryRecord[] = [
    categoryRecord(
      "mastery_evidence",
      input.masteryEvidence?.map((entry) => entry.ref) ?? [],
      requiredCategories.has("mastery_evidence"),
    ),
    categoryRecord(
      "artifacts",
      input.artifacts?.map((entry) => entry.ref) ?? [],
      requiredCategories.has("artifacts"),
    ),
    categoryRecord(
      "quiz_attempts",
      input.quizAttempts?.map((entry) => entry.ref) ?? [],
      requiredCategories.has("quiz_attempts"),
      "no_quiz_attempt_records",
    ),
    categoryRecord(
      "session_lifecycle",
      input.sessionEvents?.flatMap((entry) => (entry.ref ? [entry.ref] : [])) ?? [],
      requiredCategories.has("session_lifecycle"),
      "no_session_lifecycle_records",
    ),
    categoryRecord(
      "tutor_turns",
      input.tutorTurns?.map((entry) => entry.ref) ?? [],
      requiredCategories.has("tutor_turns"),
      "no_tutor_turn_records",
    ),
    categoryRecord(
      "tool_calls",
      input.toolCalls?.map((entry) => entry.ref) ?? [],
      requiredCategories.has("tool_calls"),
      "no_tool_call_records",
    ),
    categoryRecord(
      "learner_trait_signals",
      input.learnerTraitSignals?.map((entry) => entry.ref) ?? [],
      requiredCategories.has("learner_trait_signals"),
      "no_trait_signal_records",
    ),
    categoryRecord(
      "learner_trait_estimates",
      input.learnerTraitEstimates?.map((entry) => entry.ref) ?? [],
      requiredCategories.has("learner_trait_estimates"),
      "no_trait_estimate_records",
    ),
    categoryRecord(
      "workspace_reference_surfaces",
      input.workspaceReferenceSurfaces?.map((entry) => entry.ref) ?? [],
      requiredCategories.has("workspace_reference_surfaces"),
      "no_workspace_reference_surface_records",
    ),
    categoryRecord(
      "notebook_events",
      input.notebookEvents?.flatMap((entry) => (entry.ref ? [entry.ref] : [])) ?? [],
      requiredCategories.has("notebook_events"),
      "no_notebook_event_records",
    ),
  ];

  return evalEvidenceSnapshotSchema.parse({
    id: input.id,
    capturedAt,
    notebookId: input.notebookId,
    categories,
    snapshotRefs: [{ refType: "eval_evidence_snapshot", refId: input.id }],
    ...(input.objectives ? { objectives: input.objectives } : {}),
    ...(input.studyPlans ? { studyPlans: input.studyPlans } : {}),
    ...(input.artifacts
      ? {
          artifactsMeta: input.artifacts.map((entry) => ({
            id: entry.ref.refId,
            status: entry.status,
          })),
        }
      : {}),
    ...(input.explicitLearnerGoals ? { explicitLearnerGoals: input.explicitLearnerGoals } : {}),
    ...(input.readinessStates ? { readinessStates: input.readinessStates } : {}),
    ...(input.learningStates ? { learningStates: input.learningStates } : {}),
    ...(input.weakConceptIds ? { weakConceptIds: input.weakConceptIds } : {}),
    ...(input.curricula ? { curricula: input.curricula } : {}),
    ...(input.curriculumModules ? { curriculumModules: input.curriculumModules } : {}),
    ...(input.personalizationRecommendations
      ? { personalizationRecommendations: input.personalizationRecommendations }
      : {}),
    ...(input.traitRecommendationOnlySnapshot
      ? { traitRecommendationOnlySnapshot: input.traitRecommendationOnlySnapshot }
      : {}),
    ...(input.sessionEvents?.length ? { sessionEventRecords: input.sessionEvents } : {}),
  });
}

export function evalEvidenceSnapshotToPersistenceEvidence(
  snapshot: EvalEvidenceSnapshot,
): SyntheticLearnerAssertionPersistenceEvidence {
  const byCategory = new Map(snapshot.categories.map((entry) => [entry.category, entry]));
  const masteryCategory = byCategory.get("mastery_evidence");
  const artifactCategory = byCategory.get("artifacts");
  const sessionCategory = byCategory.get("session_lifecycle");

  const traitSignalCategory = byCategory.get("learner_trait_signals");

  const sessionEvents = snapshot.sessionEventRecords?.length
    ? snapshot.sessionEventRecords.map((entry) => ({
        ...(entry.ref ? { ref: entry.ref } : {}),
        eventType: entry.eventType,
        ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
      }))
    : sessionCategory?.refs.length
      ? sessionCategory.refs.map((ref) => ({ ref, eventType: "session.completed" }))
      : [];

  const mergedSessionEvents = [...sessionEvents];
  if (
    traitSignalCategory?.refs.length &&
    !mergedSessionEvents.some((entry) => entry.eventType === "learner_trait.signal.recorded")
  ) {
    mergedSessionEvents.push(
      ...traitSignalCategory.refs.map((ref) => ({
        ref,
        eventType: "learner_trait.signal.recorded",
      })),
    );
  }

  return {
    ...(masteryCategory?.refs.length
      ? {
          masteryEvidence: masteryEvidenceFromSnapshot(masteryCategory),
        }
      : {}),
    ...(artifactCategory?.refs.length
      ? {
          artifacts: artifactCategory.refs.map((ref) => ({
            ref,
            status:
              snapshot.artifactsMeta?.find((entry) => entry.id === ref.refId)?.status ?? "ready",
          })),
        }
      : {}),
    ...(mergedSessionEvents.length ? { sessionEvents: mergedSessionEvents } : {}),
    ...(snapshot.traitRecommendationOnlySnapshot
      ? { traitRecommendationOnlySnapshot: snapshot.traitRecommendationOnlySnapshot }
      : {}),
  };
}

function masteryEvidenceFromSnapshot(
  category: EvalEvidenceSnapshotCategoryRecord,
): NonNullable<SyntheticLearnerAssertionPersistenceEvidence["masteryEvidence"]> {
  return category.refs.map((ref) => ({ ref }));
}

export function readinessSignatureRefs(
  states: NonNullable<EvalEvidenceSnapshot["readinessStates"]> | undefined,
): NodeRef[] {
  return (states ?? []).map((entry) => ({
    refType: "source" as const,
    refId: `${entry.sourceId}:t=${entry.tutoringReady}:w=${entry.wikiReady}:g=${entry.graphReady}`,
  }));
}

export function extractForbiddenProductStateFromSnapshot(
  snapshot: EvalEvidenceSnapshot,
): SyntheticLearnerForbiddenProductStateSnapshot {
  const byCategory = new Map(snapshot.categories.map((entry) => [entry.category, entry]));
  const refs = (category: EvalEvidenceSnapshotCategory) => byCategory.get(category)?.refs ?? [];
  return {
    masteryEvidenceRefs: refs("mastery_evidence"),
    learningStateRefs: (snapshot.learningStates ?? []).map((entry) => ({
      refType: "concept",
      refId: entry.conceptId,
    })),
    weakConceptRefs: (snapshot.weakConceptIds ?? []).map((conceptId) => ({
      refType: "weak_concept",
      refId: conceptId,
    })),
    objectiveRefs: (snapshot.objectives ?? []).map((entry) => ({
      refType: "objective",
      refId: entry.id,
    })),
    curriculumRefs: [
      ...(snapshot.curricula ?? []).map(
        (entry): NodeRef => ({ refType: "curriculum", refId: entry.id }),
      ),
      ...(snapshot.curriculumModules ?? []).map(
        (entry): NodeRef => ({ refType: "curriculum_module", refId: entry.id }),
      ),
    ],
    studyPlanRefs: (snapshot.studyPlans ?? []).map((entry) => ({
      refType: "study_plan",
      refId: entry.id,
    })),
    artifactRefs: refs("artifacts"),
    sourceGroundingRefs: refs("workspace_reference_surfaces").filter(
      (ref) => ref.refType === "source" || ref.refType === "chunk",
    ),
    explicitLearnerGoalRefs: (snapshot.explicitLearnerGoals ?? []).map((entry) => ({
      refType: "notebook",
      refId: `${entry.refId}:${entry.summary}`,
    })),
    readinessRefs: readinessSignatureRefs(snapshot.readinessStates),
    traitSignalRefs: refs("learner_trait_signals"),
    traitEstimateRefs: refs("learner_trait_estimates"),
    personalizationRecommendationRefs: (snapshot.personalizationRecommendations ?? []).map(
      (entry) => ({
        refType: "personalization_recommendation",
        refId: entry.id,
      }),
    ),
  };
}

export function buildTraitRecommendationOnlySnapshot(input: {
  before: EvalEvidenceSnapshot;
  after: EvalEvidenceSnapshot;
}): NonNullable<SyntheticLearnerAssertionPersistenceEvidence["traitRecommendationOnlySnapshot"]> {
  return {
    before: extractForbiddenProductStateFromSnapshot(input.before),
    after: extractForbiddenProductStateFromSnapshot(input.after),
  };
}

export function missingRequiredSnapshotCategories(
  snapshot: EvalEvidenceSnapshot,
): EvalEvidenceSnapshotCategory[] {
  return snapshot.categories
    .filter((entry) => entry.required && entry.status !== "available")
    .map((entry) => entry.category);
}

export function mergeEvalEvidenceSnapshots(input: {
  persisted: EvalEvidenceSnapshot;
  supplemental?: BuildEvalEvidenceSnapshotInput;
}): EvalEvidenceSnapshot {
  if (!input.supplemental) return input.persisted;
  const objectives = input.supplemental.objectives ?? input.persisted.objectives;
  const studyPlans = input.supplemental.studyPlans ?? input.persisted.studyPlans;
  const explicitLearnerGoals =
    input.supplemental.explicitLearnerGoals ?? input.persisted.explicitLearnerGoals;
  const readinessStates = input.supplemental.readinessStates ?? input.persisted.readinessStates;
  const learningStates = input.supplemental.learningStates ?? input.persisted.learningStates;
  const weakConceptIds = input.supplemental.weakConceptIds ?? input.persisted.weakConceptIds;
  const curricula = input.supplemental.curricula ?? input.persisted.curricula;
  const curriculumModules =
    input.supplemental.curriculumModules ?? input.persisted.curriculumModules;
  const personalizationRecommendations =
    input.supplemental.personalizationRecommendations ??
    input.persisted.personalizationRecommendations;
  const traitRecommendationOnlySnapshot =
    input.supplemental.traitRecommendationOnlySnapshot ??
    input.persisted.traitRecommendationOnlySnapshot;
  const persistedSessionEvents = input.persisted.sessionEventRecords?.flatMap((entry) =>
    entry.ref
      ? [
          {
            ref: entry.ref,
            eventType: entry.eventType,
            ...(entry.timestamp ? { timestamp: entry.timestamp } : {}),
          },
        ]
      : [],
  );
  const merged = buildEvalEvidenceSnapshot({
    id: input.persisted.id,
    notebookId: input.persisted.notebookId,
    capturedAt: input.persisted.capturedAt,
    requiredCategories: input.persisted.categories
      .filter((entry) => entry.required)
      .map((entry) => entry.category),
    ...(input.supplemental.masteryEvidence
      ? { masteryEvidence: input.supplemental.masteryEvidence }
      : {}),
    ...(input.supplemental.artifacts ? { artifacts: input.supplemental.artifacts } : {}),
    ...(input.supplemental.quizAttempts ? { quizAttempts: input.supplemental.quizAttempts } : {}),
    ...(persistedSessionEvents?.length
      ? { sessionEvents: persistedSessionEvents }
      : input.supplemental.sessionEvents
        ? { sessionEvents: input.supplemental.sessionEvents }
        : {}),
    ...(input.supplemental.tutorTurns ? { tutorTurns: input.supplemental.tutorTurns } : {}),
    ...(input.supplemental.toolCalls ? { toolCalls: input.supplemental.toolCalls } : {}),
    ...(input.supplemental.learnerTraitSignals
      ? { learnerTraitSignals: input.supplemental.learnerTraitSignals }
      : {}),
    ...(input.supplemental.learnerTraitEstimates
      ? { learnerTraitEstimates: input.supplemental.learnerTraitEstimates }
      : {}),
    ...(input.supplemental.workspaceReferenceSurfaces
      ? { workspaceReferenceSurfaces: input.supplemental.workspaceReferenceSurfaces }
      : {}),
    ...(input.supplemental.notebookEvents
      ? { notebookEvents: input.supplemental.notebookEvents }
      : {}),
    ...(objectives ? { objectives } : {}),
    ...(studyPlans ? { studyPlans } : {}),
    ...(explicitLearnerGoals ? { explicitLearnerGoals } : {}),
    ...(readinessStates ? { readinessStates } : {}),
    ...(learningStates ? { learningStates } : {}),
    ...(weakConceptIds ? { weakConceptIds } : {}),
    ...(curricula ? { curricula } : {}),
    ...(curriculumModules ? { curriculumModules } : {}),
    ...(personalizationRecommendations ? { personalizationRecommendations } : {}),
    ...(traitRecommendationOnlySnapshot ? { traitRecommendationOnlySnapshot } : {}),
  });
  for (const category of input.persisted.categories) {
    const existing = merged.categories.find((entry) => entry.category === category.category);
    if (existing && category.status === "available" && existing.status !== "available") {
      existing.status = category.status;
      existing.refs = category.refs;
      existing.required = category.required;
      delete existing.skipReason;
    }
  }
  return evalEvidenceSnapshotSchema.parse(merged);
}

function categoryRecord(
  category: EvalEvidenceSnapshotCategory,
  refs: NodeRef[],
  required: boolean,
  missingReason?: string,
): EvalEvidenceSnapshotCategoryRecord {
  if (refs.length) {
    return evalEvidenceSnapshotCategoryRecordSchema.parse({
      category,
      status: "available",
      required,
      refs,
    });
  }
  return evalEvidenceSnapshotCategoryRecordSchema.parse({
    category,
    status: required ? "missing" : "skipped",
    required,
    ...(required ? {} : { skipReason: missingReason ?? `no_${category}_records` }),
    refs: [],
  });
}
