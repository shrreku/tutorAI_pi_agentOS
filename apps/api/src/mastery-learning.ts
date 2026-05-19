import { and, eq } from "drizzle-orm";
import { appendEvent, learningState, studyPlans, type DbClient } from "@studyagent/db";
import type { MasteryEvidence } from "@studyagent/schemas";
import { computeMasteryDeltaForEvidence, computeNextReviewDays } from "./mastery-reducer.js";

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function daysFromNow(days: number): Date {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next;
}

export async function applyMasteryEvidence(
  dbClient: DbClient,
  evidence: MasteryEvidence,
): Promise<{
  updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }>;
  weakConceptIds: string[];
}> {
  const conceptIds = [...new Set(evidence.conceptScores.map((entry) => entry.conceptId))];
  if (!conceptIds.length) {
    return { updatedConceptStates: [], weakConceptIds: [] };
  }

  const now = new Date();
  const nextReviewAt = daysFromNow(computeNextReviewDays(evidence));
  const weakConceptIds: string[] = [];
  const updatedConceptStates: Array<{ conceptId: string; masteryScore: number; nextReviewAt: string }> = [];

  for (const conceptId of conceptIds) {
    const delta = computeMasteryDeltaForEvidence(evidence, conceptId);
    const [existing] = await dbClient.db
      .select()
      .from(learningState)
      .where(
        and(
          eq(learningState.notebookId, evidence.notebookId),
          eq(learningState.userId, evidence.userId),
          eq(learningState.conceptId, conceptId),
        ),
      )
      .limit(1);

    const nextMastery = clamp((existing?.masteryScore ?? 0.35) + delta);
    const nextConfidence = clamp((existing?.confidence ?? 0.5) + delta / 2);
    const misconception = evidence.misconceptions.find((entry) => entry.conceptId === conceptId);
    const misconceptionJson =
      misconception
        ? { reason: misconception.description, observedAt: now.toISOString() }
        : evidence.correctnessLabel === "correct"
          ? (existing?.misconceptionJson ?? null)
          : existing?.misconceptionJson ?? {
              reason: `Observed ${evidence.correctnessLabel} during ${evidence.evidenceType}`,
              observedAt: now.toISOString(),
            };

    if (existing) {
      await dbClient.db
        .update(learningState)
        .set({
          masteryScore: nextMastery,
          confidence: nextConfidence,
          lastPracticedAt: now,
          nextReviewAt,
          misconceptionJson,
          metadataJson: {
            ...(existing.metadataJson ?? {}),
            lastMasteryEvidenceId: evidence.id,
            lastEvidenceType: evidence.evidenceType,
            lastCorrectnessLabel: evidence.correctnessLabel,
          },
        })
        .where(eq(learningState.id, existing.id));
    } else {
      await dbClient.db.insert(learningState).values({
        id: `ls_${crypto.randomUUID().replaceAll("-", "")}`,
        notebookId: evidence.notebookId,
        userId: evidence.userId,
        conceptId,
        masteryScore: nextMastery,
        confidence: nextConfidence,
        lastPracticedAt: now,
        nextReviewAt,
        misconceptionJson,
        metadataJson: {
          lastMasteryEvidenceId: evidence.id,
          lastEvidenceType: evidence.evidenceType,
          lastCorrectnessLabel: evidence.correctnessLabel,
        },
      });
    }

    await appendEvent(dbClient, {
      notebookId: evidence.notebookId,
      ...(evidence.sessionId ? { sessionId: evidence.sessionId } : {}),
      ...(evidence.runId ? { runId: evidence.runId } : {}),
      eventType: "learning.mastery.updated",
      payload: {
        conceptId,
        masteryScore: nextMastery,
        confidence: nextConfidence,
        masteryEvidenceId: evidence.id,
        evidenceType: evidence.evidenceType,
        correctnessLabel: evidence.correctnessLabel,
        triggerSource: evidence.triggerSource,
      },
    });

    await appendEvent(dbClient, {
      notebookId: evidence.notebookId,
      ...(evidence.sessionId ? { sessionId: evidence.sessionId } : {}),
      ...(evidence.runId ? { runId: evidence.runId } : {}),
      eventType: "learning.review.scheduled",
      payload: {
        conceptId,
        nextReviewAt: nextReviewAt.toISOString(),
        masteryEvidenceId: evidence.id,
      },
    });

    if (nextMastery < 0.45) {
      weakConceptIds.push(conceptId);
      await appendEvent(dbClient, {
        notebookId: evidence.notebookId,
        ...(evidence.sessionId ? { sessionId: evidence.sessionId } : {}),
        ...(evidence.runId ? { runId: evidence.runId } : {}),
        eventType: "learning.weak_concept.added",
        payload: {
          conceptId,
          masteryScore: nextMastery,
          masteryEvidenceId: evidence.id,
        },
      });
    }

    updatedConceptStates.push({
      conceptId,
      masteryScore: nextMastery,
      nextReviewAt: nextReviewAt.toISOString(),
    });
  }

  const [studyPlan] = await dbClient.db
    .select()
    .from(studyPlans)
    .where(and(eq(studyPlans.notebookId, evidence.notebookId), eq(studyPlans.userId, evidence.userId)))
    .limit(1);

  if (studyPlan) {
    const nextWeak = new Set(studyPlan.weakConceptIds ?? []);
    for (const conceptId of conceptIds) {
      const state = updatedConceptStates.find((item) => item.conceptId === conceptId);
      if (!state) continue;
      if (state.masteryScore < 0.45) nextWeak.add(conceptId);
      if (state.masteryScore >= 0.65) nextWeak.delete(conceptId);
    }

    await dbClient.db
      .update(studyPlans)
      .set({ weakConceptIds: [...nextWeak], updatedAt: now })
      .where(eq(studyPlans.id, studyPlan.id));

    await appendEvent(dbClient, {
      notebookId: evidence.notebookId,
      ...(evidence.sessionId ? { sessionId: evidence.sessionId } : {}),
      ...(evidence.runId ? { runId: evidence.runId } : {}),
      eventType: "study_plan.updated",
      payload: { studyPlanId: studyPlan.id, weakConceptIds: [...nextWeak], masteryEvidenceId: evidence.id },
    });
  }

  return { updatedConceptStates, weakConceptIds };
}
