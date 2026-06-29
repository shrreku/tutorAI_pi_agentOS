import { z } from "zod";
import type { ApiRequestFn } from "../request.js";
import { requestJson } from "../request.js";

const studyTemplateSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  topic: z.string(),
  sourceLevel: z.string(),
  estimatedMinutes: z.number(),
  studyMode: z.string(),
  expectedOutcome: z.string(),
});

const studyTemplatesResponseSchema = z.object({
  templates: z.array(studyTemplateSummarySchema),
});

const studyTemplateDetailResponseSchema = z.object({
  template: studyTemplateSummarySchema,
});

const createNotebookResponseSchema = z
  .object({
    notebook: z.object({ id: z.string() }).optional(),
    id: z.string().optional(),
  })
  .passthrough();

const createWorkspaceFromTemplateResponseSchema = z.object({
  notebookId: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
});

const consentResponseSchema = z.object({ ok: z.boolean().optional() }).passthrough();

const redeemAccessCodeResponseSchema = z.object({ ok: z.boolean().optional() }).passthrough();

const creditCheckoutPacksResponseSchema = z.object({
  packs: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      creditType: z.enum(["tutor", "ingestion"]),
      priceCents: z.number(),
      currency: z.literal("usd"),
      description: z.string(),
    }),
  ),
});

const creditCheckoutResponseSchema = z.object({
  checkoutUrl: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
});

const accountDeletionResponseSchema = z.object({ ok: z.boolean().optional() }).passthrough();

const feedbackResponseSchema = z.object({ ok: z.boolean().optional() }).passthrough();

const studyStateResponseSchema = z.record(z.string(), z.unknown());

const artifactsResponseSchema = z.object({
  artifacts: z.array(z.record(z.string(), z.unknown())).default([]),
});

const graphLayoutResponseSchema = z.object({
  positions: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
});

export type StudyTemplateSummary = z.infer<typeof studyTemplateSummarySchema>;

export type ProductRequestOptions = { signal?: AbortSignal };

export async function listStudyTemplates(
  request: ApiRequestFn,
  options: ProductRequestOptions = {},
): Promise<StudyTemplateSummary[]> {
  const result = await requestJson(request, {
    path: "/study-templates",
    schema: studyTemplatesResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data.templates;
}

export async function getStudyTemplate(
  request: ApiRequestFn,
  templateId: string,
  options: ProductRequestOptions = {},
): Promise<StudyTemplateSummary> {
  const result = await requestJson(request, {
    path: `/study-templates/${encodeURIComponent(templateId)}`,
    schema: studyTemplateDetailResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data.template;
}

export async function createWorkspaceFromTemplate(
  request: ApiRequestFn,
  templateId: string,
  options: ProductRequestOptions = {},
): Promise<string> {
  const result = await requestJson(request, {
    path: "/workspaces/from-template",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
    },
    schema: createWorkspaceFromTemplateResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  if (!result.data.notebookId) {
    throw new Error(result.data.message ?? "Workspace created but no notebook id was returned");
  }
  return result.data.notebookId;
}

export async function createNotebook(
  request: ApiRequestFn,
  title: string,
  options: ProductRequestOptions = {},
): Promise<string> {
  const result = await requestJson(request, {
    path: "/notebooks",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
    schema: createNotebookResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  const id = result.data.notebook?.id ?? result.data.id;
  if (!id) throw new Error("Notebook created but no id was returned");
  return id;
}

export async function submitConsent(
  request: ApiRequestFn,
  options: ProductRequestOptions = {},
): Promise<void> {
  await requestJson(request, {
    path: "/consent",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: true }),
    },
    schema: consentResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
}

export async function redeemAccessCode(
  request: ApiRequestFn,
  code: string,
  options: ProductRequestOptions = {},
): Promise<void> {
  await requestJson(request, {
    path: "/access-codes/redeem",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    },
    schema: redeemAccessCodeResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
}

export async function submitLearningFeedback(
  request: ApiRequestFn,
  body: {
    studyGoal: string;
    helped: boolean;
    confusionText?: string;
    alternativeWorkflow?: string;
    contactPermission: boolean;
    notebookId?: string;
  },
  options: ProductRequestOptions = {},
): Promise<void> {
  await requestJson(request, {
    path: "/feedback/learning",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    schema: feedbackResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
}

export async function submitAccountDeletionRequest(
  request: ApiRequestFn,
  notes: string,
  options: ProductRequestOptions = {},
): Promise<void> {
  await requestJson(request, {
    path: "/account/deletion-request",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    },
    schema: accountDeletionResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
}

export async function listCreditCheckoutPacks(
  request: ApiRequestFn,
  options: ProductRequestOptions = {},
): Promise<z.infer<typeof creditCheckoutPacksResponseSchema>["packs"] | null> {
  const response = await request("/checkout/credits/packs", {
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  if (response.status === 404) {
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    if (body.code === "feature_disabled") return null;
  }
  if (!response.ok) throw new Error("Failed to load credit packs");
  const data = creditCheckoutPacksResponseSchema.parse(await response.json());
  return data.packs;
}

export async function startCreditCheckout(
  request: ApiRequestFn,
  packId: string,
  options: ProductRequestOptions = {},
): Promise<string> {
  const result = await requestJson(request, {
    path: "/checkout/credits",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId }),
    },
    schema: creditCheckoutResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  if (!result.data.checkoutUrl) {
    throw new Error(result.data.message ?? "Checkout started but no redirect URL was returned");
  }
  return result.data.checkoutUrl;
}

export async function getNotebookStudyState<T = Record<string, unknown>>(
  request: ApiRequestFn,
  notebookId: string,
  options: ProductRequestOptions = {},
): Promise<T> {
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/study-state`,
    schema: studyStateResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data as T;
}

export async function listNotebookArtifacts(
  request: ApiRequestFn,
  notebookId: string,
  options: ProductRequestOptions = {},
): Promise<Record<string, unknown>[]> {
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/artifacts`,
    schema: artifactsResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data.artifacts;
}

export async function getGraphLayout(
  request: ApiRequestFn,
  notebookId: string,
  options: ProductRequestOptions = {},
): Promise<Record<string, { x: number; y: number }>> {
  const result = await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/graph/layout`,
    schema: graphLayoutResponseSchema,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  return result.data.positions;
}

export async function saveGraphNodeLayout(
  request: ApiRequestFn,
  notebookId: string,
  nodeId: string,
  input: { position: { x: number; y: number }; nodeType: string; refType: string },
  options: ProductRequestOptions = {},
): Promise<void> {
  await requestJson(request, {
    path: `/notebooks/${encodeURIComponent(notebookId)}/graph/layout/${encodeURIComponent(nodeId)}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    schema: z.object({ ok: z.boolean().optional() }).passthrough(),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
}

export function studyTemplatesQueryKey() {
  return ["study-templates"] as const;
}

export function studyTemplateQueryKey(templateId: string) {
  return ["study-templates", templateId] as const;
}

export function studyTemplatesQueryOptions(request: ApiRequestFn) {
  return {
    queryKey: studyTemplatesQueryKey(),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      listStudyTemplates(request, signal !== undefined ? { signal } : {}),
  };
}

export function studyTemplateQueryOptions(request: ApiRequestFn, templateId: string) {
  return {
    queryKey: studyTemplateQueryKey(templateId),
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      getStudyTemplate(request, templateId, signal !== undefined ? { signal } : {}),
  };
}
