import { and, desc, eq, inArray } from "drizzle-orm";
import { appendEvent, learnerTraitEstimates, learnerTraitSignals, type DbClient } from "@studyagent/db";
import {
  learnerTraitEstimateSchema,
  learnerTraitSignalSchema,
  type LearnerTraitEstimate,
  type LearnerTraitKey,
  type LearnerTraitSignal,
} from "@studyagent/schemas";

export type RecordLearnerTraitSignalInput = LearnerTraitSignal & {
  runId?: string;
};

export type UpdateLearnerTraitEstimateInput = LearnerTraitEstimate & {
  notebookId: string;
  userId: string;
};

export async function recordLearnerTraitSignal(
  dbClient: DbClient,
  signal: RecordLearnerTraitSignalInput,
): Promise<{ signal: LearnerTraitSignal; eventId: string }> {
  const parsed = learnerTraitSignalSchema.parse(signal);

  await dbClient.db.insert(learnerTraitSignals).values({
    id: parsed.id,
    notebookId: parsed.notebookId,
    userId: parsed.userId,
    source: parsed.source,
    trait: parsed.trait,
    signalJson: parsed as unknown as Record<string, unknown>,
    evidenceRefsJson: parsed.evidenceRefs,
    sessionId: parsed.sessionId ?? null,
    turnId: parsed.turnId ?? null,
    runId: parsed.runId ?? null,
    observedAt: new Date(parsed.observedAt),
  });

  const event = await appendEvent(dbClient, {
    notebookId: parsed.notebookId,
    ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
    ...(parsed.runId ? { runId: parsed.runId } : {}),
    eventType: "learner_trait.signal.recorded",
    payload: {
      signalId: parsed.id,
      userId: parsed.userId,
      source: parsed.source,
      trait: parsed.trait,
      evidenceRefs: parsed.evidenceRefs,
      internalVisibility: true,
    },
  });

  return { signal: parsed, eventId: event.id };
}

export async function readRecentLearnerTraitSignals(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    sessionId?: string;
    traits?: LearnerTraitKey[];
    limit?: number;
  },
): Promise<LearnerTraitSignal[]> {
  const conditions = [
    eq(learnerTraitSignals.notebookId, input.notebookId),
    eq(learnerTraitSignals.userId, input.userId),
    ...(input.sessionId ? [eq(learnerTraitSignals.sessionId, input.sessionId)] : []),
    ...(input.traits?.length ? [inArray(learnerTraitSignals.trait, input.traits)] : []),
  ];
  const rows = await dbClient.db
    .select()
    .from(learnerTraitSignals)
    .where(and(...conditions))
    .orderBy(desc(learnerTraitSignals.createdAt))
    .limit(input.limit ?? 50);

  return rows.map((row) => learnerTraitSignalSchema.parse(row.signalJson));
}

export async function readCurrentLearnerTraitEstimates(
  dbClient: DbClient,
  input: {
    notebookId: string;
    userId: string;
    traits?: LearnerTraitKey[];
  },
): Promise<LearnerTraitEstimate[]> {
  const conditions = [
    eq(learnerTraitEstimates.notebookId, input.notebookId),
    eq(learnerTraitEstimates.userId, input.userId),
    ...(input.traits?.length ? [inArray(learnerTraitEstimates.trait, input.traits)] : []),
  ];
  const rows = await dbClient.db
    .select()
    .from(learnerTraitEstimates)
    .where(and(...conditions))
    .orderBy(desc(learnerTraitEstimates.updatedAt));

  return rows.map((row) => learnerTraitEstimateSchema.parse(row.estimateJson));
}

export async function upsertCurrentLearnerTraitEstimate(
  dbClient: DbClient,
  estimate: UpdateLearnerTraitEstimateInput,
): Promise<LearnerTraitEstimate> {
  const now = new Date();
  const parsed = learnerTraitEstimateSchema.parse({
    ...estimate,
    id: estimate.id ?? `lte_${crypto.randomUUID().replaceAll("-", "")}`,
    updatedAt: estimate.updatedAt ?? now.toISOString(),
  });
  const targetRefType = parsed.targetRef?.refType ?? "notebook";
  const targetRefId = parsed.targetRef?.refId ?? "notebook";

  await dbClient.db
    .insert(learnerTraitEstimates)
    .values({
      id: parsed.id as string,
      notebookId: estimate.notebookId,
      userId: estimate.userId,
      trait: parsed.trait,
      targetRefType,
      targetRefId,
      lane: parsed.lane,
      confidence: parsed.confidence,
      estimateJson: parsed as unknown as Record<string, unknown>,
      evidenceRefsJson: parsed.evidenceRefs,
      contradictionRefsJson: parsed.contradictionRefs,
      guardrailJson: parsed.guardrail ?? {},
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        learnerTraitEstimates.notebookId,
        learnerTraitEstimates.userId,
        learnerTraitEstimates.trait,
        learnerTraitEstimates.targetRefType,
        learnerTraitEstimates.targetRefId,
      ],
      set: {
        id: parsed.id as string,
        lane: parsed.lane,
        confidence: parsed.confidence,
        estimateJson: parsed as unknown as Record<string, unknown>,
        evidenceRefsJson: parsed.evidenceRefs,
        contradictionRefsJson: parsed.contradictionRefs,
        guardrailJson: parsed.guardrail ?? {},
        updatedAt: now,
      },
    });

  return parsed;
}

export function buildLearnerTraitReadModel(input: {
  signals: LearnerTraitSignal[];
  estimates: LearnerTraitEstimate[];
}): {
  signals: LearnerTraitSignal[];
  estimates: LearnerTraitEstimate[];
  summary: { signalCount: number; estimateCount: number; traitsWithSignals: LearnerTraitKey[] };
} {
  const traitsWithSignals = [...new Set(input.signals.map((signal) => signal.trait))];
  return {
    signals: input.signals,
    estimates: input.estimates,
    summary: {
      signalCount: input.signals.length,
      estimateCount: input.estimates.length,
      traitsWithSignals,
    },
  };
}
