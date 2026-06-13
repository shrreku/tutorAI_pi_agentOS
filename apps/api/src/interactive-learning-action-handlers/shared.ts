import { and, eq } from "drizzle-orm";
import { artifacts } from "@studyagent/db";
import type { AppContext } from "../context.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function persistWorkedExampleStepAnswer(
  ctx: AppContext,
  input: {
    notebookId: string;
    artifactId: string;
    stepId: string;
    answer: string;
    isCorrect?: boolean;
    revealed?: boolean;
  },
): Promise<void> {
  const [artifact] = await ctx.db.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, input.artifactId), eq(artifacts.notebookId, input.notebookId)))
    .limit(1);
  if (!artifact) return;

  const payload = { ...(artifact.payloadJson ?? {}) };
  const stepAnswers = Array.isArray(payload.stepAnswers) ? payload.stepAnswers : [];
  stepAnswers.push({
    stepId: input.stepId,
    answer: input.answer,
    isCorrect: input.isCorrect ?? null,
    revealed: input.revealed ?? false,
    answeredAt: new Date().toISOString(),
  });
  payload.stepAnswers = stepAnswers;

  await ctx.db.db
    .update(artifacts)
    .set({ payloadJson: payload, updatedAt: new Date() })
    .where(eq(artifacts.id, input.artifactId));
}
