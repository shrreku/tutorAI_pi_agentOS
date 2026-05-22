import { and, eq, desc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { NodeRef } from "@studyagent/schemas";
import { appendEvent, artifacts, claims, concepts, graphRelations, notebooks, quizAttempts, wikiPages } from "@studyagent/db";
import { lintNotebookWiki, type WikiLintIssue } from "@studyagent/wiki-core";
import type { AppContext } from "../context.js";
import {
  applyArtifactLifecycleAction,
  deriveArtifactLifecycleEventType,
  normalizeArtifactLifecycleStatus,
  validateArtifactTransition,
} from "../artifact-lifecycle.js";
import { mergeNoteArtifactPayload } from "@studyagent/schemas";
import { buildLearningArtifactView } from "../artifact-view.js";
import { resolveActor } from "../auth.js";
import { recordFlashcardReview, recordQuizAttempt } from "../phase7.js";
import { loadNotebookStudyState } from "../study-state.js";

export async function registerNotebookRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get("/notebooks", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const rows = await ctx.db.db
      .select()
      .from(notebooks)
      .where(eq(notebooks.ownerId, actor.id))
      .orderBy(desc(notebooks.updatedAt));

    return reply.send({ notebooks: rows });
  });

  app.post<{ Body: { title: string; description?: string; goal?: string } }>(
    "/notebooks",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const body = request.body;
      if (!body?.title || typeof body.title !== "string") {
        return reply.status(400).send({ code: "bad_request", message: "title is required" });
      }

      const id = `nb_${crypto.randomUUID().replaceAll("-", "")}`;
      const now = new Date();
      await ctx.db.db.insert(notebooks).values({
        id,
        ownerId: actor.id,
        title: body.title,
        description: body.description ?? null,
        goal: body.goal ?? null,
        defaultMode: "explore",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });

      await appendEvent(ctx.db, {
        notebookId: id,
        eventType: "graph.node.created",
        payload: { kind: "notebook", notebookId: id },
      });

      const [created] = await ctx.db.db.select().from(notebooks).where(eq(notebooks.id, id)).limit(1);
      return reply.status(201).send({ notebook: created });
    },
  );

  app.get<{ Params: { notebookId: string } }>("/notebooks/:notebookId", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    const [row] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    return reply.send({ notebook: row });
  });

  app.get<{ Params: { notebookId: string } }>("/notebooks/:notebookId/settings", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    const [row] = await ctx.db.db
      .select({ settingsJson: notebooks.settingsJson })
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    return reply.send({ settings: row.settingsJson ?? {} });
  });

  app.patch<{
    Params: { notebookId: string };
    Body: Partial<{
      artifactConsent: Partial<{
        autoCreateLearnerArtifacts: boolean;
        autoCreateNotes: boolean;
      }>;
    }>;
  }>("/notebooks/:notebookId/settings", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    const [row] = await ctx.db.db
      .select({ settingsJson: notebooks.settingsJson })
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const existing = isJsonRecord(row.settingsJson) ? row.settingsJson : {};
    const existingConsent = isJsonRecord(existing.artifactConsent) ? existing.artifactConsent : {};
    const requestedConsent = isJsonRecord(request.body?.artifactConsent) ? request.body.artifactConsent : {};
    const nextArtifactConsent = {
      ...existingConsent,
      ...(typeof requestedConsent.autoCreateLearnerArtifacts === "boolean"
        ? { autoCreateLearnerArtifacts: requestedConsent.autoCreateLearnerArtifacts }
        : {}),
      ...(typeof requestedConsent.autoCreateNotes === "boolean" ? { autoCreateNotes: requestedConsent.autoCreateNotes } : {}),
    };
    const nextSettings = { ...existing, artifactConsent: nextArtifactConsent };

    await ctx.db.db.update(notebooks).set({ settingsJson: nextSettings, updatedAt: new Date() }).where(eq(notebooks.id, notebookId));
    await appendEvent(ctx.db, {
      notebookId,
      eventType: "notebook.settings.updated",
      payload: { updatedFields: ["artifactConsent"], artifactConsent: nextArtifactConsent },
    });

    return reply.send({ settings: nextSettings });
  });

  app.get<{ Params: { notebookId: string } }>("/notebooks/:notebookId/study-state", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    const [row] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const studyState = await loadNotebookStudyState(ctx.db, notebookId, actor.id);
    return reply.send(studyState);
  });

  app.get<{ Params: { notebookId: string } }>("/notebooks/:notebookId/artifacts", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    const [row] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const rows = await ctx.db.db
      .select({
        id: artifacts.id,
        notebookId: artifacts.notebookId,
        title: artifacts.title,
        artifactType: artifacts.artifactType,
        status: artifacts.status,
        payloadJson: artifacts.payloadJson,
        sourceNodeRefsJson: artifacts.sourceNodeRefsJson,
        sourceClaimIds: artifacts.sourceClaimIds,
        sourceChunkIds: artifacts.sourceChunkIds,
        updatedAt: artifacts.updatedAt,
        createdAt: artifacts.createdAt,
      })
      .from(artifacts)
      .where(eq(artifacts.notebookId, notebookId))
      .orderBy(desc(artifacts.updatedAt));

    const learnerReferenceArtifacts = rows.filter((artifact) => !["teaching_arc", "study_plan", "session_plan"].includes(artifact.artifactType));

    return reply.send({
      artifacts: learnerReferenceArtifacts.map((artifact) => ({
        id: artifact.id,
        title: artifact.title,
        artifactType: artifact.artifactType,
        status: artifact.status,
        updatedAt: artifact.updatedAt.toISOString(),
        createdAt: artifact.createdAt.toISOString(),
        view: buildLearningArtifactView(artifact),
        preview:
          typeof artifact.payloadJson?.markdown === "string"
            ? artifact.payloadJson.markdown.slice(0, 220)
            : typeof artifact.payloadJson?.prompt === "string"
              ? artifact.payloadJson.prompt.slice(0, 220)
              : typeof artifact.payloadJson?.summary === "string"
                ? artifact.payloadJson.summary.slice(0, 220)
              : "",
      })),
    });
  });

  app.get<{ Params: { notebookId: string; artifactId: string } }>(
    "/notebooks/:notebookId/artifacts/:artifactId",
    async (request, reply) => {
      const actor = await resolveActor(ctx, request);
      const { notebookId, artifactId } = request.params;
      const [row] = await ctx.db.db
        .select()
        .from(notebooks)
        .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
        .limit(1);

      if (!row) {
        return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
      }

      const [artifact] = await ctx.db.db
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, notebookId)))
        .limit(1);

      if (!artifact) {
        return reply.status(404).send({ code: "not_found", message: "Artifact not found" });
      }

      return reply.send({ artifact: serializeArtifactDetail(artifact) });
    },
  );

  app.get<{
    Params: { notebookId: string; artifactId: string };
  }>("/notebooks/:notebookId/artifacts/:artifactId/quiz-attempts", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId, artifactId } = request.params;
    const [row] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const [artifact] = await ctx.db.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, notebookId)))
      .limit(1);

    if (!artifact || artifact.artifactType !== "quiz") {
      return reply.status(404).send({ code: "not_found", message: "Quiz artifact not found" });
    }

    const rows = await ctx.db.db
      .select({
        id: quizAttempts.id,
        questionId: quizAttempts.questionId,
        answerJson: quizAttempts.answerJson,
        isCorrect: quizAttempts.isCorrect,
        score: quizAttempts.score,
        conceptIds: quizAttempts.conceptIds,
        createdAt: quizAttempts.createdAt,
      })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.notebookId, notebookId), eq(quizAttempts.artifactId, artifactId), eq(quizAttempts.userId, actor.id)))
      .orderBy(desc(quizAttempts.createdAt));

    return reply.send({
      attempts: rows.map((attempt) => ({
        id: attempt.id,
        questionId: attempt.questionId,
        answer: typeof attempt.answerJson?.answer === "string" ? attempt.answerJson.answer : "",
        explanation: typeof attempt.answerJson?.explanation === "string" ? attempt.answerJson.explanation : null,
        isCorrect: attempt.isCorrect === 1,
        score: attempt.score ?? null,
        conceptIds: attempt.conceptIds ?? [],
        createdAt: attempt.createdAt.toISOString(),
      })),
    });
  });

  app.post<{
    Params: { notebookId: string; artifactId: string };
    Body: { note?: string };
  }>("/notebooks/:notebookId/artifacts/:artifactId/approve", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId, artifactId } = request.params;
    const artifact = await loadOwnedArtifact(ctx, actor.id, notebookId, artifactId);
    if (artifact === "notebook_missing") {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }
    if (!artifact) {
      return reply.status(404).send({ code: "not_found", message: "Artifact not found" });
    }

    const previousStatus = artifact.status;
    const sourceRefs = Array.isArray(artifact.sourceNodeRefsJson)
      ? (artifact.sourceNodeRefsJson as NodeRef[])
      : [];
    const lifecycle = applyArtifactLifecycleAction({
      action: "approve",
      artifactType: artifact.artifactType,
      currentStatus: previousStatus,
      payload: (artifact.payloadJson ?? {}) as Record<string, unknown>,
      sourceRefs,
    });
    if (!lifecycle.allowed) {
      return reply.status(lifecycle.transition.valid ? 409 : 400).send({
        code: lifecycle.transition.valid ? "artifact_quality_gate_failed" : "artifact_lifecycle_transition_invalid",
        message: lifecycle.reason ?? "Artifact cannot be approved.",
        issues: lifecycle.quality.issues,
        developerDiagnostics: lifecycle.quality.developerDiagnostics,
      });
    }
    const nowIso = new Date().toISOString();
    const nextPayload = {
      ...(artifact.payloadJson ?? {}),
      approvedBy: actor.id,
      approvedAt: nowIso,
      ...(typeof request.body?.note === "string" && request.body.note.trim() ? { approvalNote: request.body.note.trim() } : {}),
    };

    await ctx.db.db
      .update(artifacts)
      .set({ status: lifecycle.nextStatus, payloadJson: nextPayload, updatedAt: new Date() })
      .where(eq(artifacts.id, artifactId));

    await appendEvent(ctx.db, {
      notebookId,
      eventType: lifecycle.eventType ?? "artifact.approved",
      payload: {
        artifactId,
        artifactType: artifact.artifactType,
        previousStatus,
        nextStatus: lifecycle.nextStatus,
        approvedBy: actor.id,
        visibility: lifecycle.visibility,
        quality: lifecycle.quality,
      },
    });
    await appendEvent(ctx.db, {
      notebookId,
      eventType: "artifact.ready",
      payload: { artifactId, artifactType: artifact.artifactType, status: "ready" },
    });

    const [updated] = await ctx.db.db.select().from(artifacts).where(eq(artifacts.id, artifactId)).limit(1);
    return reply.send({ artifact: serializeArtifactDetail(updated) });
  });

  app.post<{
    Params: { notebookId: string; artifactId: string };
    Body: { reason?: string };
  }>("/notebooks/:notebookId/artifacts/:artifactId/reject", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId, artifactId } = request.params;
    const artifact = await loadOwnedArtifact(ctx, actor.id, notebookId, artifactId);
    if (artifact === "notebook_missing") {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }
    if (!artifact) {
      return reply.status(404).send({ code: "not_found", message: "Artifact not found" });
    }

    const previousStatus = artifact.status;
    const sourceRefs = Array.isArray(artifact.sourceNodeRefsJson)
      ? (artifact.sourceNodeRefsJson as NodeRef[])
      : [];
    const lifecycle = applyArtifactLifecycleAction({
      action: "reject",
      artifactType: artifact.artifactType,
      currentStatus: previousStatus,
      payload: (artifact.payloadJson ?? {}) as Record<string, unknown>,
      sourceRefs,
    });
    if (!lifecycle.allowed) {
      return reply.status(400).send({
        code: "artifact_lifecycle_transition_invalid",
        message: lifecycle.reason ?? "Artifact cannot be rejected from its current state.",
      });
    }
    const nowIso = new Date().toISOString();
    const nextPayload = {
      ...(artifact.payloadJson ?? {}),
      rejectedBy: actor.id,
      rejectedAt: nowIso,
      ...(typeof request.body?.reason === "string" && request.body.reason.trim() ? { rejectionReason: request.body.reason.trim() } : {}),
    };

    await ctx.db.db
      .update(artifacts)
      .set({ status: lifecycle.nextStatus, payloadJson: nextPayload, updatedAt: new Date() })
      .where(eq(artifacts.id, artifactId));

    await appendEvent(ctx.db, {
      notebookId,
      eventType: lifecycle.eventType ?? "artifact.rejected",
      payload: {
        artifactId,
        artifactType: artifact.artifactType,
        previousStatus,
        nextStatus: lifecycle.nextStatus,
        rejectedBy: actor.id,
        visibility: lifecycle.visibility,
      },
    });

    const [updated] = await ctx.db.db.select().from(artifacts).where(eq(artifacts.id, artifactId)).limit(1);
    return reply.send({ artifact: serializeArtifactDetail(updated) });
  });

  app.post<{
    Params: { notebookId: string; artifactId: string };
    Body: {
      questionId: string;
      answer: string;
      isCorrect: boolean;
      score?: number;
      conceptIds?: string[];
      explanation?: string;
    };
  }>("/notebooks/:notebookId/artifacts/:artifactId/quiz-attempts", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId, artifactId } = request.params;
    const [row] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const [artifact] = await ctx.db.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, notebookId)))
      .limit(1);

    if (!artifact || artifact.artifactType !== "quiz") {
      return reply.status(404).send({ code: "not_found", message: "Quiz artifact not found" });
    }

    const body = request.body ?? ({} as Record<string, unknown>);
    const payload = (artifact.payloadJson ?? {}) as Record<string, unknown>;
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    const selectedQuestion = questions.find(
      (question) =>
        question &&
        typeof question === "object" &&
        (question as { id?: unknown }).id === body.questionId,
    ) as { conceptId?: string; explanation?: string } | undefined;

    const conceptIds = (body.conceptIds?.length ? body.conceptIds : selectedQuestion?.conceptId ? [selectedQuestion.conceptId] : [])
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    const explanation =
      typeof body.explanation === "string"
        ? body.explanation
        : typeof selectedQuestion?.explanation === "string"
          ? selectedQuestion.explanation
          : undefined;

    const result = await recordQuizAttempt(ctx.db, {
      notebookId,
      userId: actor.id,
      artifactId,
      questionId: body.questionId,
      answer: body.answer,
      isCorrect: body.isCorrect,
      conceptIds,
      ...(body.score !== undefined ? { score: body.score } : {}),
      ...(explanation ? { explanation } : {}),
    });

    return reply.send({
      ok: true,
      attemptId: result.attemptId,
      updatedConceptStates: result.updatedConceptStates,
    });

  });

  app.post<{
    Params: { notebookId: string; artifactId: string };
    Body: {
      cardId: string;
      result: "again" | "hard" | "good" | "easy";
      conceptIds?: string[];
    };
  }>("/notebooks/:notebookId/artifacts/:artifactId/flashcard-reviews", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId, artifactId } = request.params;
    const [row] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const [artifact] = await ctx.db.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, notebookId)))
      .limit(1);

    if (!artifact || artifact.artifactType !== "flashcards") {
      return reply.status(404).send({ code: "not_found", message: "Flashcards artifact not found" });
    }

    const body = request.body ?? ({} as Record<string, unknown>);
    const payload = (artifact.payloadJson ?? {}) as Record<string, unknown>;
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    const selectedCard = cards.find(
      (card) =>
        card &&
        typeof card === "object" &&
        (card as { id?: unknown }).id === body.cardId,
    ) as { conceptId?: string } | undefined;

    const conceptIds = (body.conceptIds?.length ? body.conceptIds : selectedCard?.conceptId ? [selectedCard.conceptId] : [])
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    const result = await recordFlashcardReview(ctx.db, {
      notebookId,
      userId: actor.id,
      artifactId,
      cardId: body.cardId,
      result: body.result,
      conceptIds,
    });

    return reply.send({
      ok: true,
      updatedConceptStates: result.updatedConceptStates,
    });
  });

  app.patch<{
    Params: { notebookId: string; artifactId: string };
    Body: Partial<{ title: string; noteMarkdown: string; status: string; clearPersonalization?: boolean }>;
  }>("/notebooks/:notebookId/artifacts/:artifactId", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId, artifactId } = request.params;
    const [row] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const [artifact] = await ctx.db.db
      .select()
      .from(artifacts)
      .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, notebookId)))
      .limit(1);

    if (!artifact) {
      return reply.status(404).send({ code: "not_found", message: "Artifact not found" });
    }

    const patch = request.body ?? {};
    if (patch.noteMarkdown !== undefined && artifact.artifactType !== "note") {
      return reply.status(400).send({ code: "bad_request", message: "Only note artifacts support markdown edits" });
    }
    const nextPayload =
      artifact.artifactType === "note"
        ? mergeNoteArtifactPayload((artifact.payloadJson ?? {}) as Record<string, unknown>, {
            ...(patch.noteMarkdown !== undefined ? { noteMarkdown: patch.noteMarkdown } : {}),
            ...(patch.clearPersonalization ? { clearPersonalization: true } : {}),
          })
        : { ...(artifact.payloadJson ?? {}) };

    const nextTitle = typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : artifact.title;
    const requestedStatus =
      typeof patch.status === "string" && patch.status.trim() ? patch.status.trim() : artifact.status;
    const updatedAt = new Date();
    const previousStatus = artifact.status;
    const normalizedPrevious =
      normalizeArtifactLifecycleStatus(previousStatus) ?? (previousStatus as "draft");
    const normalizedNext =
      normalizeArtifactLifecycleStatus(requestedStatus) ??
      (requestedStatus as "draft" | "proposed" | "ready" | "rejected" | "failed" | "archived");
    if (patch.status !== undefined) {
      const transition = validateArtifactTransition(normalizedPrevious, normalizedNext);
      if (!transition.valid) {
        return reply.status(400).send({
          code: "artifact_lifecycle_transition_invalid",
          message: transition.reason ?? "Artifact status transition is not allowed.",
        });
      }
    }
    const nextStatus = normalizedNext;

    await ctx.db.db
      .update(artifacts)
      .set({
        title: nextTitle,
        status: nextStatus,
        payloadJson: nextPayload,
        updatedAt,
      })
      .where(eq(artifacts.id, artifactId));

    await appendEvent(ctx.db, {
      notebookId,
      eventType: "artifact.updated",
      payload: {
        artifactId,
        artifactType: artifact.artifactType,
        title: nextTitle,
        updatedFields: [
          ...(patch.title !== undefined ? ["title"] : []),
          ...(patch.noteMarkdown !== undefined ? ["noteMarkdown"] : []),
          ...(patch.status !== undefined ? ["status"] : []),
        ],
      },
    });

    if (patch.status !== undefined) {
      const lifecycleEventType = deriveArtifactLifecycleEventType(previousStatus, nextStatus);

      if (lifecycleEventType && lifecycleEventType !== "artifact.updated") {
        await appendEvent(ctx.db, {
          notebookId,
          eventType: lifecycleEventType,
          payload: {
            artifactId,
            artifactType: artifact.artifactType,
            title: nextTitle,
            previousStatus,
            nextStatus,
          },
        });
      }
    }

    const [updated] = await ctx.db.db.select().from(artifacts).where(eq(artifacts.id, artifactId)).limit(1);
    return reply.send({
      artifact: updated
        ? {
            id: updated.id,
            title: updated.title,
            artifactType: updated.artifactType,
            status: updated.status,
            payload: updated.payloadJson ?? {},
            sourceNodeRefs: updated.sourceNodeRefsJson ?? [],
            sourceClaimIds: updated.sourceClaimIds ?? [],
            sourceChunkIds: updated.sourceChunkIds ?? [],
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString(),
          }
        : null,
    });
  });

  app.patch<{
    Params: { notebookId: string };
    Body: Partial<{ title: string; description: string | null; goal: string | null }>;
  }>("/notebooks/:notebookId", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    const [existing] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);

    if (!existing) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const patch = request.body ?? {};
    const next = {
      ...existing,
      title: typeof patch.title === "string" ? patch.title : existing.title,
      description: patch.description !== undefined ? patch.description : existing.description,
      goal: patch.goal !== undefined ? patch.goal : existing.goal,
      updatedAt: new Date(),
    };

    await ctx.db.db
      .update(notebooks)
      .set({
        title: next.title,
        description: next.description,
        goal: next.goal,
        updatedAt: next.updatedAt,
      })
      .where(eq(notebooks.id, notebookId));

    const [updated] = await ctx.db.db.select().from(notebooks).where(eq(notebooks.id, notebookId)).limit(1);
    return reply.send({ notebook: updated });
  });

  app.delete<{ Params: { notebookId: string } }>("/notebooks/:notebookId", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    const deleted = await ctx.db.db
      .delete(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .returning({ id: notebooks.id });

    if (deleted.length === 0) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    return reply.status(204).send();
  });

  app.get<{ Params: { notebookId: string } }>("/notebooks/:notebookId/wiki/lint", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    const [nb] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);
    if (!nb) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const pages = await ctx.db.db.select().from(wikiPages).where(eq(wikiPages.notebookId, notebookId));
    const conceptRows = await ctx.db.db.select().from(concepts).where(eq(concepts.notebookId, notebookId));
    const claimRows = await ctx.db.db.select().from(claims).where(eq(claims.notebookId, notebookId));
    const relRows = await ctx.db.db.select().from(graphRelations).where(eq(graphRelations.notebookId, notebookId));

    const issues = lintNotebookWiki({
      pages: pages.map((p) => ({
        id: p.id,
        title: p.title,
        pageType: p.pageType,
        pageKey: p.pageKey,
        markdown: p.markdown,
        sourceClaimIds: p.sourceClaimIds,
        status: p.status,
        updatedAt: p.updatedAt,
        structuredJson: p.structuredJson ?? {},
      })),
      concepts: conceptRows.map((c) => ({ id: c.id, canonicalName: c.canonicalName })),
      claims: claimRows.map((c) => ({
        id: c.id,
        status: c.status,
        claimText: c.claimText,
        metadataJson: c.metadataJson ?? {},
      })),
      graphRelations: relRows.map((r) => ({
        relationType: r.relationType,
        sourceNodeType: r.sourceNodeType,
        sourceNodeId: r.sourceNodeId,
        targetNodeType: r.targetNodeType,
        targetNodeId: r.targetNodeId,
      })),
    });

    return reply.send({ issues, issueCount: issues.length });
  });

  app.post<{ Params: { notebookId: string } }>("/notebooks/:notebookId/wiki/lint", async (request, reply) => {
    const actor = await resolveActor(ctx, request);
    const { notebookId } = request.params;
    const [nb] = await ctx.db.db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, actor.id)))
      .limit(1);
    if (!nb) {
      return reply.status(404).send({ code: "not_found", message: "Notebook not found" });
    }

    const pages = await ctx.db.db.select().from(wikiPages).where(eq(wikiPages.notebookId, notebookId));
    const conceptRows = await ctx.db.db.select().from(concepts).where(eq(concepts.notebookId, notebookId));
    const claimRows = await ctx.db.db.select().from(claims).where(eq(claims.notebookId, notebookId));
    const relRows = await ctx.db.db.select().from(graphRelations).where(eq(graphRelations.notebookId, notebookId));

    const issues = lintNotebookWiki({
      pages: pages.map((p) => ({
        id: p.id,
        title: p.title,
        pageType: p.pageType,
        pageKey: p.pageKey,
        markdown: p.markdown,
        sourceClaimIds: p.sourceClaimIds,
        status: p.status,
        updatedAt: p.updatedAt,
        structuredJson: p.structuredJson ?? {},
      })),
      concepts: conceptRows.map((c) => ({ id: c.id, canonicalName: c.canonicalName })),
      claims: claimRows.map((c) => ({
        id: c.id,
        status: c.status,
        claimText: c.claimText,
        metadataJson: c.metadataJson ?? {},
      })),
      graphRelations: relRows.map((r) => ({
        relationType: r.relationType,
        sourceNodeType: r.sourceNodeType,
        sourceNodeId: r.sourceNodeId,
        targetNodeType: r.targetNodeType,
        targetNodeId: r.targetNodeId,
      })),
    });

    await appendEvent(ctx.db, {
      notebookId,
      eventType: "wiki.lint.completed",
      payload: {
        issueCount: issues.length,
        codes: [...new Set(issues.map((i: WikiLintIssue) => i.code))],
      },
    });

    return reply.send({ issues, issueCount: issues.length });
  });
}

type ArtifactRow = typeof artifacts.$inferSelect;

async function loadOwnedArtifact(
  ctx: AppContext,
  ownerId: string,
  notebookId: string,
  artifactId: string,
): Promise<ArtifactRow | null | "notebook_missing"> {
  const [row] = await ctx.db.db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.ownerId, ownerId)))
    .limit(1);

  if (!row) return "notebook_missing";

  const [artifact] = await ctx.db.db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.notebookId, notebookId)))
    .limit(1);

  return artifact ?? null;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function serializeArtifactDetail(artifact: ArtifactRow | null | undefined) {
  if (!artifact) return null;
  const view = buildLearningArtifactView({
    id: artifact.id,
    notebookId: artifact.notebookId,
    artifactType: artifact.artifactType,
    title: artifact.title,
    status: artifact.status,
    payloadJson: artifact.payloadJson ?? {},
    sourceNodeRefsJson: artifact.sourceNodeRefsJson ?? [],
    sourceClaimIds: artifact.sourceClaimIds ?? [],
    sourceChunkIds: artifact.sourceChunkIds ?? [],
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  });
  return {
    id: artifact.id,
    title: artifact.title,
    artifactType: artifact.artifactType,
    status: artifact.status,
    payload: artifact.payloadJson ?? {},
    view,
    sourceNodeRefs: artifact.sourceNodeRefsJson ?? [],
    sourceClaimIds: artifact.sourceClaimIds ?? [],
    sourceChunkIds: artifact.sourceChunkIds ?? [],
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}
