import type { FastifyRequest } from "fastify";
import type { Actor } from "../auth.js";
import { resolveActor } from "../auth.js";
import type { AppContext } from "../context.js";
import {
  ensureUserProductState,
  EntitlementError,
  requireBetaConsent,
  requireStudyAccess,
  type UserProductState,
} from "./entitlements.js";

export type LearnerContext = {
  actor: Actor;
  productState: UserProductState;
};

function devProductState(userId: string): UserProductState {
  const now = new Date();
  return {
    userId,
    studyAccess: 1,
    ingestionAccess: 0,
    adminAccess: 0,
    pilotTagsJson: [],
    onboardingJson: {},
    trialBudgetGrantedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Standard gate for protected learner product actions (study access + beta consent). */
export async function requireLearner(
  ctx: AppContext,
  request: FastifyRequest,
  options?: { skipConsent?: boolean },
): Promise<LearnerContext> {
  if (ctx.env.DISABLE_AUTH) {
    const actor = await resolveActor(ctx, request);
    let productState: UserProductState;
    try {
      productState = await ensureUserProductState(ctx, actor.id);
    } catch {
      productState = devProductState(actor.id);
    }
    if (productState.studyAccess <= 0) {
      throw new EntitlementError("study_access_required", "Study access is required.");
    }
    if (!options?.skipConsent) {
      await requireBetaConsent(ctx, request);
    }
    return { actor, productState };
  }

  const { actor, productState } = await requireStudyAccess(ctx, request);
  if (!options?.skipConsent) {
    await requireBetaConsent(ctx, request);
  }
  return { actor, productState };
}
