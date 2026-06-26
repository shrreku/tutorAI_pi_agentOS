import type { FastifyReply, FastifyRequest } from "fastify";
import type { Actor } from "../auth.js";
import type { AppContext } from "../context.js";
import {
  EntitlementError,
  requireAdminAccess,
  sendAuthOrEntitlementError,
} from "./entitlements.js";
import { requireLearner } from "./learner-gate.js";
import { requireOwnedNotebook, type OwnedNotebookContext } from "./notebook-context.js";

export async function withLearner<T>(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  handler: (actor: Actor) => Promise<T>,
): Promise<T | FastifyReply> {
  try {
    const { actor } = await requireLearner(ctx, request);
    return await handler(actor);
  } catch (error) {
    return sendAuthOrEntitlementError(reply, error);
  }
}

export async function withOwnedNotebook<T>(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  notebookId: string,
  handler: (actor: Actor, notebook: OwnedNotebookContext) => Promise<T>,
): Promise<T | FastifyReply> {
  try {
    const { actor } = await requireLearner(ctx, request);
    const notebook = await requireOwnedNotebook(ctx, actor.id, notebookId);
    return await handler(actor, notebook);
  } catch (error) {
    return sendAuthOrEntitlementError(reply, error);
  }
}

export function entitlementNotFound(message = "Notebook not found."): EntitlementError {
  return new EntitlementError("not_found", message, 404);
}

export async function withAdminAccess<T>(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  handler: (actor: Actor) => Promise<T>,
): Promise<T | FastifyReply> {
  try {
    const { actor } = await requireAdminAccess(ctx, request);
    return await handler(actor);
  } catch (error) {
    return sendAuthOrEntitlementError(reply, error);
  }
}
