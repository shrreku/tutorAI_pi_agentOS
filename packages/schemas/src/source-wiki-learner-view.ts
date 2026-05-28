import { z } from "zod";

const rawClaimSchema = z.object({
  id: z.string(),
  status: z.string(),
  claimText: z.string(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  supportScore: z.number().min(0).max(1).nullable().optional(),
  evidence: z.array(z.object({ sourceRef: z.string(), excerpt: z.string() })).default([]),
});

export const sourceWikiLearnerViewSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  learnerStatus: z.enum(["available", "still_improving", "needs_source_support", "temporarily_unavailable"]),
  markdown: z.string(),
  evidenceGroups: z.array(z.object({ title: z.string(), citations: z.array(z.object({ sourceRef: z.string(), excerpt: z.string() })) })),
  warnings: z.array(z.string()).default([]),
  devMode: z.boolean(),
  debug: z.record(z.string(), z.unknown()).nullable().default(null),
});

export type SourceWikiLearnerView = z.infer<typeof sourceWikiLearnerViewSchema>;

const learnerVisibleClaimStatuses = new Set(["published", "verified"]);

export function buildSourceWikiLearnerView(input: {
  page: { id: string; title: string; status: string; markdown: string };
  claims: z.input<typeof rawClaimSchema>[];
  devMode?: boolean;
  projectionWarning?: string | null;
}): SourceWikiLearnerView {
  const devMode = input.devMode ?? false;
  const claims = input.claims.map((claim) => rawClaimSchema.parse(claim));
  const learnerClaims = claims.filter((claim) => {
    if (!learnerVisibleClaimStatuses.has(claim.status)) return false;
    if ((claim.confidence ?? 0) < 0.55) return false;
    if ((claim.supportScore ?? 0) < 0.45) return false;
    return claim.evidence.length > 0;
  });

  const warnings = [
    input.projectionWarning,
    input.page.status === "failed" ? "Source Wiki is temporarily unavailable while this page is refreshed." : null,
    input.page.status !== "published" && input.page.status !== "active" ? "This page is still improving." : null,
  ].filter((value): value is string => Boolean(value));

  const learnerStatus =
    input.page.status === "failed"
      ? "temporarily_unavailable"
      : learnerClaims.length === 0
        ? "needs_source_support"
        : input.page.status === "published" || input.page.status === "active"
          ? "available"
          : "still_improving";

  return sourceWikiLearnerViewSchema.parse({
    pageId: input.page.id,
    title: input.page.title,
    learnerStatus,
    markdown: input.page.markdown,
    evidenceGroups: learnerClaims.map((claim) => ({
      title: claim.claimText,
      citations: claim.evidence,
    })),
    warnings,
    devMode,
    debug: devMode
      ? {
          rawPageStatus: input.page.status,
          hiddenClaimIds: claims.filter((claim) => !learnerClaims.includes(claim)).map((claim) => claim.id),
          rawClaims: claims,
        }
      : null,
  });
}
