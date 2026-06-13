import { eq } from "drizzle-orm";
import { notebooks } from "@studyagent/db";
import type { AppContext } from "./context.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function blockStateKey(blockId: string): string {
  return `interactiveBlockState:${blockId}`;
}

function simulationStateKey(nodeId: string): string {
  return `interactiveSimulationState:${nodeId}`;
}

export async function loadNotebookSettingsJson(
  ctx: AppContext,
  notebookId: string,
): Promise<Record<string, unknown>> {
  try {
    const [notebook] = await ctx.db.db
      .select({ settingsJson: notebooks.settingsJson })
      .from(notebooks)
      .where(eq(notebooks.id, notebookId))
      .limit(1);
    if (!notebook || !isRecord(notebook.settingsJson)) return {};
    return notebook.settingsJson;
  } catch {
    return {};
  }
}

export async function loadInteractiveBlockState(
  ctx: AppContext,
  notebookId: string,
  blockId: string,
): Promise<Record<string, unknown>> {
  const settings = await loadNotebookSettingsJson(ctx, notebookId);
  const existing = settings[blockStateKey(blockId)];
  return isRecord(existing) ? existing : {};
}

export async function mergeInteractiveBlockState(
  ctx: AppContext,
  input: {
    notebookId: string;
    blockId: string;
    patch: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const settings = await loadNotebookSettingsJson(ctx, input.notebookId);
  const key = blockStateKey(input.blockId);
  const existing = isRecord(settings[key]) ? settings[key] : {};
  const next = { ...existing, ...input.patch };

  try {
    await ctx.db.db
      .update(notebooks)
      .set({
        settingsJson: {
          ...settings,
          [key]: next,
        },
        updatedAt: new Date(),
      })
      .where(eq(notebooks.id, input.notebookId));
  } catch {
    return next;
  }

  return next;
}

export async function loadSimulationObservations(
  ctx: AppContext,
  notebookId: string,
  nodeId: string,
): Promise<unknown[]> {
  const settings = await loadNotebookSettingsJson(ctx, notebookId);
  const existing = settings[simulationStateKey(nodeId)];
  if (!isRecord(existing) || !Array.isArray(existing.observations)) return [];
  return existing.observations;
}

export async function persistSimulationObservation(
  ctx: AppContext,
  input: {
    notebookId: string;
    nodeId: string;
    observation: string;
    parameterSnapshot?: Record<string, unknown>;
  },
): Promise<void> {
  const settings = await loadNotebookSettingsJson(ctx, input.notebookId);
  const key = simulationStateKey(input.nodeId);
  const existing = isRecord(settings[key]) ? settings[key] : {};
  const observations = Array.isArray(existing.observations) ? existing.observations : [];
  observations.push({
    observation: input.observation,
    parameterSnapshot: input.parameterSnapshot ?? null,
    submittedAt: new Date().toISOString(),
  });

  await ctx.db.db
    .update(notebooks)
    .set({
      settingsJson: {
        ...settings,
        [key]: {
          ...existing,
          observations,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(notebooks.id, input.notebookId));
}
