import { learnerTraitValueByKeySchema } from "@studyagent/schemas";
import { studentProfileUpdatePreferencesInputSchema } from "@studyagent/tools";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import { withOwnedNotebook } from "../hosted-beta/route-guards.js";
import { readStudentProfile, upsertStudentProfile } from "../student-profile.js";
import { recordLearnerTraitSignal } from "../learner-trait-store.js";

export async function registerStudentProfileRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get<{ Params: { notebookId: string } }>("/notebooks/:notebookId/student-profile", async (request, reply) => {
    const { notebookId } = request.params;
    return withOwnedNotebook(ctx, request, reply, notebookId, async (actor) => {
      const profile = await readStudentProfile(ctx.db, notebookId, actor.id);
      return reply.send({ studentProfile: profile });
    });
  });

  app.patch<{ Params: { notebookId: string } }>("/notebooks/:notebookId/student-profile", async (request, reply) => {
    const { notebookId } = request.params;
    return withOwnedNotebook(ctx, request, reply, notebookId, async (actor) => {
      const parsed = studentProfileUpdatePreferencesInputSchema.safeParse(normalizeStudentProfilePatch(request.body ?? {}));

      if (!parsed.success) {
        return reply.status(400).send({ code: "bad_request", message: parsed.error.flatten() });
      }

      const result = await upsertStudentProfile(ctx.db, {
        notebookId,
        userId: parsed.data.userId ?? actor.id,
        patch: parsed.data,
      });
      await recordPreferenceSignals(ctx, {
        notebookId,
        userId: parsed.data.userId ?? actor.id,
        studentProfileId: result.profile.id,
        patch: parsed.data,
      });

      return reply.send({ studentProfile: result.profile });
    });
  });
}

async function recordPreferenceSignals(
  ctx: AppContext,
  input: {
    notebookId: string;
    userId: string;
    studentProfileId: string;
    patch: Record<string, unknown>;
  },
): Promise<void> {
  const candidates: Array<{ trait: string; value: unknown }> = [
    { trait: "pacePreference", value: input.patch.pacePreference },
    { trait: "depthPreference", value: input.patch.depthPreference },
    { trait: "examplePreference", value: recordPreferenceValue(input.patch.examplePreferencesJson) },
    { trait: "assessmentPreference", value: recordPreferenceValue(input.patch.assessmentPreferenceJson) },
  ];

  for (const candidate of candidates) {
    if (candidate.value === undefined || candidate.value === null) continue;
    const parsed = learnerTraitValueByKeySchema.safeParse(candidate);
    if (!parsed.success) continue;
    await recordLearnerTraitSignal(ctx.db, {
      id: `lts_${crypto.randomUUID().replaceAll("-", "")}`,
      notebookId: input.notebookId,
      userId: input.userId,
      source: "onboarding_profile",
      trait: parsed.data.trait,
      suggestedValue: parsed.data.value,
      strength: 0.95,
      confidence: 0.95,
      evidenceRefs: [{ refType: "student_profile", refId: input.studentProfileId }],
      internalVisibility: true,
      observedAt: new Date().toISOString(),
      notes: "Learner-facing preference control update.",
    } as Parameters<typeof recordLearnerTraitSignal>[1]);
  }
}

function recordPreferenceValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>).preference;
}

function normalizeStudentProfilePatch(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const input = body as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...input };

  if (normalized.examplePreferencesJson === undefined && input.examplePreference !== undefined) {
    normalized.examplePreferencesJson = { preference: input.examplePreference };
  }
  if (normalized.assessmentPreferenceJson === undefined && input.assessmentPreference !== undefined) {
    normalized.assessmentPreferenceJson = { preference: input.assessmentPreference };
  }
  if (normalized.constraintsJson === undefined && input.constraints !== undefined) {
    normalized.constraintsJson = input.constraints;
  }

  return normalized;
}
