import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  concepts,
  createDb,
  learningState,
  masteryEvidence,
  notebooks,
  users,
} from "@studyagent/db";
import type { MasteryEvidence } from "@studyagent/schemas";
import { recordAndApplyMasteryEvidence } from "./mastery-pipeline.js";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://studyagent:studyagent@127.0.0.1:5433/studyagent";
const shouldRun = process.env.RUN_POSTGRES_INTEGRATION === "1";

describe("mastery pipeline Postgres idempotency", () => {
  it("persists and applies the same evidence id exactly once", async () => {
    if (!shouldRun) return;

    const dbClient = createDb(DATABASE_URL);
    const suffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const userId = `usr_mastery_${suffix}`;
    const notebookId = `nb_mastery_${suffix}`;
    const conceptId = `cnc_mastery_${suffix}`;
    const evidenceId = `mev_mastery_${suffix}`;
    const now = new Date();

    const evidence: MasteryEvidence = {
      id: evidenceId,
      notebookId,
      userId,
      correctnessLabel: "correct",
      overallScore: 0.9,
      conceptScores: [{ conceptId, score: 0.8, delta: 0.12, role: "primary" }],
      misconceptions: [],
      readiness: "proficient",
      tutoringIntervention: "advance",
      uncertainty: 0.1,
      confidence: 0.9,
      evidenceType: "mastery_check",
      triggerSource: "runtime_auto",
      sourceRefs: [],
      contextRefs: [],
      evaluatorProvenance: {
        mode: "deterministic",
        model: null,
        fallbackUsed: false,
        notes: "Postgres idempotency regression test.",
      },
    };

    try {
      await dbClient.db.insert(users).values({
        id: userId,
        email: `${userId}@example.com`,
        displayName: "Mastery Idempotency Test",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });
      await dbClient.db.insert(notebooks).values({
        id: notebookId,
        ownerId: userId,
        title: "Mastery Idempotency Test",
        defaultMode: "explore",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });
      await dbClient.db.insert(concepts).values({
        id: conceptId,
        notebookId,
        canonicalName: "Idempotency",
        aliases: [],
        metadataJson: {},
        createdAt: now,
        updatedAt: now,
      });

      const first = await recordAndApplyMasteryEvidence(dbClient, evidence, {
        applyAdaptivePlan: false,
      });
      const [stateAfterFirst] = await dbClient.db
        .select({ masteryScore: learningState.masteryScore })
        .from(learningState)
        .where(
          and(
            eq(learningState.notebookId, notebookId),
            eq(learningState.userId, userId),
            eq(learningState.conceptId, conceptId),
          ),
        );

      const replay = await recordAndApplyMasteryEvidence(dbClient, evidence, {
        applyAdaptivePlan: false,
      });
      const [stateAfterReplay] = await dbClient.db
        .select({ masteryScore: learningState.masteryScore })
        .from(learningState)
        .where(
          and(
            eq(learningState.notebookId, notebookId),
            eq(learningState.userId, userId),
            eq(learningState.conceptId, conceptId),
          ),
        );
      const evidenceRows = await dbClient.db
        .select({ id: masteryEvidence.id })
        .from(masteryEvidence)
        .where(eq(masteryEvidence.id, evidenceId));

      expect(first.replayed).toBe(false);
      expect(replay.replayed).toBe(true);
      expect(replay.eventId).toBe(first.eventId);
      expect(stateAfterReplay?.masteryScore).toBe(stateAfterFirst?.masteryScore);
      expect(evidenceRows).toHaveLength(1);
    } finally {
      await dbClient.db.delete(notebooks).where(eq(notebooks.id, notebookId));
      await dbClient.db.delete(users).where(eq(users.id, userId));
      await dbClient.sql.end();
    }
  });
});
