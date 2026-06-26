import {
  generationModeSchema,
  pageReadinessLabel,
  pageReadinessSchema,
  type GenerationMode,
  type PageReadiness,
} from "@studyagent/schemas";

export { pageReadinessLabel };
export type { PageReadiness, GenerationMode };

export type WikiPageReadinessInput = {
  status: string;
  qualityScore?: number | null;
  sourceClaimIds?: string[];
  structuredJson?: Record<string, unknown> | null;
};

export function resolveGenerationModeFromWikiRecord(
  structuredJson: Record<string, unknown> | null | undefined,
): GenerationMode {
  const parsed = generationModeSchema.safeParse(structuredJson?.generationMode);
  if (parsed.success) return parsed.data;
  if (
    structuredJson?.regeneratedMode === "ai" ||
    typeof structuredJson?.lastPolishedAt === "string"
  ) {
    return "llm_polished";
  }
  if (structuredJson?.touchTrigger === "tutor_touch") return "tutor_touch";
  return "heuristic";
}

export function resolvePageReadinessFromWikiPage(page: WikiPageReadinessInput): PageReadiness {
  const stored = pageReadinessSchema.safeParse(page.structuredJson?.pageReadiness);
  if (stored.success) return stored.data;

  return derivePageReadiness({
    ...(page.qualityScore !== undefined ? { qualityScore: page.qualityScore } : {}),
    evidenceCount: page.sourceClaimIds?.length ?? 0,
    generationMode: resolveGenerationModeFromWikiRecord(page.structuredJson),
    hasStaleMaterial: page.status === "stale",
  });
}

export type DerivePageReadinessInput = {
  qualityScore?: number | null;
  evidenceCount: number;
  generationMode: GenerationMode;
  hasStaleMaterial?: boolean;
};

export function derivePageReadiness(input: DerivePageReadinessInput): PageReadiness {
  if (input.hasStaleMaterial) {
    return "needs_refresh";
  }

  if (input.evidenceCount === 0) {
    return "needs_more_source_support";
  }

  if (input.generationMode === "heuristic") {
    return input.evidenceCount >= 3 ? "still_improving" : "needs_more_source_support";
  }

  const score = typeof input.qualityScore === "number" ? input.qualityScore : null;
  if (score !== null && score >= 0.75 && input.evidenceCount >= 2) {
    return "ready_to_study";
  }

  if (score !== null && score < 0.45) {
    return "needs_more_source_support";
  }

  return "still_improving";
}

export function learnerPageReadinessLabel(input: DerivePageReadinessInput): string {
  return pageReadinessLabel(derivePageReadiness(input));
}
