import { z } from "zod";
import { idSchema, nodeRefSchema } from "./ids.js";
import { sourceReadinessSchema } from "./source-readiness.js";

export const dashboardSurfaceSchema = z.enum([
  "study_map",
  "reading",
  "interactive",
  "app",
  "practice",
  "tutor",
]);
export type DashboardSurface = z.infer<typeof dashboardSurfaceSchema>;

export const dashboardIntentSchema = z.enum(["continue", "review", "practice", "resume"]);
export type DashboardIntent = z.infer<typeof dashboardIntentSchema>;

export const dashboardActionTargetSchema = z.object({
  surface: dashboardSurfaceSchema,
  intent: dashboardIntentSchema,
  nodeRef: nodeRefSchema.optional(),
  artifactId: idSchema.optional(),
  sessionId: idSchema.optional(),
});
export type DashboardActionTarget = z.infer<typeof dashboardActionTargetSchema>;

export const dashboardResumeActionSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  target: dashboardActionTargetSchema,
});
export type DashboardResumeAction = z.infer<typeof dashboardResumeActionSchema>;

export const dashboardNotebookReadinessSchema = z.enum([
  "empty",
  "processing",
  "not_ready",
  "partial",
  "ready",
]);
export type DashboardNotebookReadiness = z.infer<typeof dashboardNotebookReadinessSchema>;

export const dashboardNotebookSummarySchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  progressPercent: z.number().int().min(0).max(100),
  modulesLabel: z.string().min(1),
  lastActivityLabel: z.string().min(1),
  readiness: dashboardNotebookReadinessSchema,
  resumeAction: dashboardResumeActionSchema,
});
export type DashboardNotebookSummary = z.infer<typeof dashboardNotebookSummarySchema>;

export const dashboardRecentActivitySchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  notebookTitle: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().nullable().default(null),
  occurredAt: z.string().datetime(),
  actionTarget: dashboardActionTargetSchema.optional(),
});
export type DashboardRecentActivity = z.infer<typeof dashboardRecentActivitySchema>;

export const dashboardStudyTimeAggregateSchema = z.object({
  totalMinutes: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
});

export const dashboardStudyTimeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("unavailable"),
  }),
  z.object({
    status: z.literal("ready"),
    week: dashboardStudyTimeAggregateSchema.optional(),
    month: dashboardStudyTimeAggregateSchema.optional(),
  }),
]);
export type DashboardStudyTime = z.infer<typeof dashboardStudyTimeSchema>;

export const learnerDashboardHeaderSchema = z.object({
  displayName: z.string().nullable(),
  generatedAt: z.string().datetime(),
});
export type LearnerDashboardHeader = z.infer<typeof learnerDashboardHeaderSchema>;

export const dashboardPracticeItemStatusSchema = z.enum(["ready", "suggested", "overdue"]);
export type DashboardPracticeItemStatus = z.infer<typeof dashboardPracticeItemStatusSchema>;

export const dashboardDuePracticeItemSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  notebookTitle: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().nullable().default(null),
  minutesEstimate: z.number().int().positive().optional(),
  status: dashboardPracticeItemStatusSchema,
  actionTarget: dashboardActionTargetSchema,
});
export type DashboardDuePracticeItem = z.infer<typeof dashboardDuePracticeItemSchema>;

export const dashboardDuePracticeSectionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unavailable") }),
  z.object({ status: z.literal("empty") }),
  z.object({
    status: z.literal("ready"),
    items: z.array(dashboardDuePracticeItemSchema),
  }),
]);
export type DashboardDuePracticeSection = z.infer<typeof dashboardDuePracticeSectionSchema>;

export const dashboardRecommendationStatusSchema = z.enum(["active", "suggested", "done"]);
export type DashboardRecommendationStatus = z.infer<typeof dashboardRecommendationStatusSchema>;

export const dashboardRecommendationSchema = z.object({
  id: idSchema,
  notebookId: idSchema,
  notebookTitle: z.string().min(1),
  label: z.string().min(1),
  reason: z.string().min(1),
  status: dashboardRecommendationStatusSchema,
  minutesEstimate: z.number().int().positive().optional(),
  actionTarget: dashboardActionTargetSchema,
});
export type DashboardRecommendation = z.infer<typeof dashboardRecommendationSchema>;

export const dashboardRecommendationsSectionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unavailable") }),
  z.object({ status: z.literal("empty") }),
  z.object({
    status: z.literal("ready"),
    items: z.array(dashboardRecommendationSchema),
    enrichmentStatus: z.enum(["fresh", "pending", "failed", "none"]).default("none"),
  }),
]);
export type DashboardRecommendationsSection = z.infer<typeof dashboardRecommendationsSectionSchema>;

export const learnerDashboardSummarySchema = z.object({
  version: z.literal(1),
  header: learnerDashboardHeaderSchema,
  notebooks: z.array(dashboardNotebookSummarySchema),
  recentActivity: z.array(dashboardRecentActivitySchema),
  studyTime: dashboardStudyTimeSchema,
  duePractice: dashboardDuePracticeSectionSchema,
  recommendations: dashboardRecommendationsSectionSchema,
});
export type LearnerDashboardSummary = z.infer<typeof learnerDashboardSummarySchema>;

export const workspaceSourceSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  ready: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type WorkspaceSourceSummary = z.infer<typeof workspaceSourceSummarySchema>;

export const workspaceStudySummarySchema = z.object({
  status: z.enum(["empty", "building", "ready"]),
  curriculumTitle: z.string().nullable().default(null),
  moduleTitle: z.string().nullable().default(null),
  objectiveTitle: z.string().nullable().default(null),
  progressPercent: z.number().int().min(0).max(100).default(0),
  activeSessionId: idSchema.nullable().default(null),
  canContinueSession: z.boolean().default(false),
});
export type WorkspaceStudySummary = z.infer<typeof workspaceStudySummarySchema>;

export const notebookWorkspaceBootstrapSchema = z.object({
  version: z.literal(1),
  notebook: z.object({
    id: idSchema,
    title: z.string().min(1),
    description: z.string().nullable().default(null),
    workspaceType: z.string().min(1),
    templateId: idSchema.nullable().default(null),
  }),
  sourceSummary: workspaceSourceSummarySchema,
  studySummary: workspaceStudySummarySchema,
  allowedSurfaces: z.array(dashboardSurfaceSchema),
  initialActionTarget: dashboardActionTargetSchema,
  fallbackReason: z.string().nullable().optional(),
});
export type NotebookWorkspaceBootstrap = z.infer<typeof notebookWorkspaceBootstrapSchema>;

function readSearchParam(
  search: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = search[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function serializeDashboardActionTargetToSearch(
  target: DashboardActionTarget,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("surface", target.surface);
  params.set("intent", target.intent);
  if (target.artifactId) params.set("artifactId", target.artifactId);
  if (target.sessionId) params.set("sessionId", target.sessionId);
  if (target.nodeRef) {
    params.set("refType", target.nodeRef.refType);
    params.set("refId", target.nodeRef.refId);
    if (target.nodeRef.handle) params.set("refHandle", target.nodeRef.handle);
    if (target.nodeRef.title) params.set("refTitle", target.nodeRef.title);
    if (target.nodeRef.label) params.set("refLabel", target.nodeRef.label);
  }
  return params;
}

export function parseDashboardActionTargetFromSearch(
  search: Record<string, string | string[] | undefined>,
): DashboardActionTarget | null {
  const surface = readSearchParam(search, "surface");
  const intent = readSearchParam(search, "intent");
  if (!surface || !intent) return null;

  const refType = readSearchParam(search, "refType");
  const refId = readSearchParam(search, "refId");
  const nodeRef =
    refType && refId
      ? nodeRefSchema.safeParse({
          refType,
          refId,
          ...(readSearchParam(search, "refHandle")
            ? { handle: readSearchParam(search, "refHandle") }
            : {}),
          ...(readSearchParam(search, "refTitle")
            ? { title: readSearchParam(search, "refTitle") }
            : {}),
          ...(readSearchParam(search, "refLabel")
            ? { label: readSearchParam(search, "refLabel") }
            : {}),
        }).data
      : undefined;

  const parsed = dashboardActionTargetSchema.safeParse({
    surface,
    intent,
    ...(nodeRef ? { nodeRef } : {}),
    ...(readSearchParam(search, "artifactId")
      ? { artifactId: readSearchParam(search, "artifactId") }
      : {}),
    ...(readSearchParam(search, "sessionId")
      ? { sessionId: readSearchParam(search, "sessionId") }
      : {}),
  });
  return parsed.success ? parsed.data : null;
}

export function buildNotebookWorkspaceHref(
  notebookId: string,
  target: DashboardActionTarget,
): string {
  const params = serializeDashboardActionTargetToSearch(target);
  const query = params.toString();
  return query.length > 0 ? `/notebooks/${notebookId}?${query}` : `/notebooks/${notebookId}`;
}

export const creditsSummarySchema = z.object({
  percentRemaining: z.number(),
  exhausted: z.boolean(),
  tutorCreditsCents: z.number().optional(),
  ingestionCreditsCents: z.number().optional(),
});
export type CreditsSummary = z.infer<typeof creditsSummarySchema>;

export const onboardingStateSchema = z.object({
  completed: z.boolean(),
  studyGoal: z.string().optional(),
  level: z.string().optional(),
  skipped: z.boolean().optional(),
});
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

export const meResponseSchema = z.object({
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      displayName: z.string().nullable(),
    })
    .nullable(),
  authenticated: z.boolean(),
  disabled: z.boolean(),
  consentAccepted: z.boolean(),
  consentVersion: z.string().nullable(),
  entitlements: z.object({
    studyAccess: z.boolean(),
    ingestionAccess: z.boolean(),
    adminAccess: z.boolean(),
  }),
  credits: creditsSummarySchema.optional(),
  onboarding: onboardingStateSchema.optional(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const meApiPayloadSchema = z
  .object({
    user: z
      .object({
        id: z.string(),
        email: z.string(),
        displayName: z.string().nullable(),
      })
      .optional(),
    actor: z.object({ id: z.string(), email: z.string() }).optional(),
    authenticated: z.boolean().optional(),
    disabled: z.boolean().optional(),
    consentAccepted: z.boolean().optional(),
    consentVersion: z.string().nullable().optional(),
    entitlements: meResponseSchema.shape.entitlements.optional(),
    productState: z
      .object({
        studyAccess: z.number(),
        ingestionAccess: z.number(),
        adminAccess: z.number(),
      })
      .optional(),
    consent: z
      .object({
        accepted: z.boolean(),
        requiredVersion: z.string(),
      })
      .optional(),
    credits: creditsSummarySchema.optional(),
    onboarding: onboardingStateSchema.optional(),
    onboardingJson: z.record(z.string(), z.unknown()).optional(),
    code: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();
export type MeApiPayload = z.infer<typeof meApiPayloadSchema>;

export function mapOnboardingState(body: MeApiPayload): OnboardingState | undefined {
  if (body.onboarding) {
    return body.onboarding;
  }
  const json = body.onboardingJson;
  if (!json || typeof json !== "object") {
    return undefined;
  }
  const completed = Boolean(json.completed || json.skipped);
  return {
    completed,
    ...(typeof json.studyGoal === "string" ? { studyGoal: json.studyGoal } : {}),
    ...(typeof json.level === "string" ? { level: json.level } : {}),
    ...(json.skipped ? { skipped: true } : {}),
  };
}

export function mapMeResponse(body: MeApiPayload): MeResponse {
  const user = body.user ?? (body.actor ? { ...body.actor, displayName: null } : null);
  const entitlements = body.entitlements ?? {
    studyAccess: (body.productState?.studyAccess ?? 0) > 0,
    ingestionAccess: (body.productState?.ingestionAccess ?? 0) > 0,
    adminAccess: (body.productState?.adminAccess ?? 0) > 0,
  };

  const onboarding = mapOnboardingState(body);

  return {
    user,
    authenticated: body.authenticated ?? Boolean(user),
    disabled: body.disabled ?? false,
    consentAccepted: body.consentAccepted ?? body.consent?.accepted ?? false,
    consentVersion:
      body.consentVersion ?? (body.consent?.accepted ? body.consent.requiredVersion : null),
    entitlements,
    ...(body.credits ? { credits: body.credits } : {}),
    ...(onboarding ? { onboarding } : {}),
  };
}

export const notebookRecordSchema = z
  .object({
    id: idSchema,
    title: z.string(),
    workspaceType: z.string(),
    updatedAt: z.union([z.string(), z.date()]),
    createdAt: z.union([z.string(), z.date()]).optional(),
    description: z.string().nullable().optional(),
    goal: z.string().nullable().optional(),
    studyTemplateId: z.string().nullable().optional(),
    defaultMode: z.string().optional(),
    ownerId: z.string().optional(),
  })
  .passthrough();
export type NotebookRecord = z.infer<typeof notebookRecordSchema>;

export const notebooksListResponseSchema = z.object({
  notebooks: z.array(notebookRecordSchema),
});

export const notebookDetailResponseSchema = z.object({
  notebook: notebookRecordSchema,
});

export const sourceLearnerViewSchema = z.object({
  id: idSchema,
  title: z.string(),
  readiness: sourceReadinessSchema,
  learnerLabel: z.string(),
  learnerDetail: z.string(),
  tutoringReady: z.boolean(),
  sourceWikiReady: z.boolean(),
  projectionReady: z.boolean(),
  metadata: z.object({ fromTemplate: z.boolean().optional() }).optional(),
});

export const notebookSourcesResponseSchema = z.object({
  sources: z.array(sourceLearnerViewSchema),
});

export const graphQueryBodySchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("study_map"),
    limit: z.number().int().min(1).max(200).optional(),
    devMode: z.boolean().optional(),
  }),
  z.object({
    name: z.literal("source_wiki_map"),
    sourceId: z.string().min(1),
    limit: z.number().int().min(1).max(200).optional(),
    devMode: z.boolean().optional(),
  }),
  z.object({
    name: z.literal("concept_neighborhood"),
    conceptId: z.string().min(1),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  z.object({
    name: z.literal("concept_path"),
    fromConceptId: z.string().min(1),
    toConceptId: z.string().min(1),
    maxHops: z.number().int().min(1).max(12).optional(),
  }),
]);
export type GraphQueryBody = z.infer<typeof graphQueryBodySchema>;
