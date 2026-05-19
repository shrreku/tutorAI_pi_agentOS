import { z } from "zod";

export const sourceLevelSchema = z.enum([
  "high_school",
  "undergraduate",
  "graduate",
  "professional",
  "unknown",
]);

export type SourceLevel = z.infer<typeof sourceLevelSchema>;

export const sourceScopePolicySchema = z.enum(["soft_source_scope", "strict_source_scope"]);

export type SourceScopePolicy = z.infer<typeof sourceScopePolicySchema>;

export const learnerReadinessLevelSchema = z.enum([
  "foundational",
  "developing",
  "proficient",
  "advanced",
  "unknown",
]);

export type LearnerReadinessLevel = z.infer<typeof learnerReadinessLevelSchema>;

export const learnerLevelTargetRefSchema = z.object({
  refType: z.enum(["concept", "objective", "source"]),
  refId: z.string().min(1),
});

export type LearnerLevelTargetRef = z.infer<typeof learnerLevelTargetRefSchema>;

export const learnerReadinessEvidenceRefSchema = z.object({
  refType: z.enum(["learning_state", "student_profile", "self_report", "objective", "source"]),
  refId: z.string().min(1),
});

export const learnerReadinessSchema = z.object({
  targetRef: learnerLevelTargetRefSchema,
  readiness: learnerReadinessLevelSchema,
  inferredLevel: sourceLevelSchema.optional(),
  evidenceRefs: z.array(learnerReadinessEvidenceRefSchema).default([]),
  confidence: z.number().min(0).max(1).nullable().default(null),
  lastUpdatedReason: z.string().min(1),
});

export type LearnerReadiness = z.infer<typeof learnerReadinessSchema>;

export const sourceLevelRecordSchema = z.object({
  sourceId: z.string().min(1),
  level: sourceLevelSchema,
  confidence: z.number().min(0).max(1).nullable().default(null),
  lastUpdatedReason: z.string().min(1),
});

export type SourceLevelRecord = z.infer<typeof sourceLevelRecordSchema>;

export function parseSourceLevel(value: unknown): SourceLevel {
  const parsed = sourceLevelSchema.safeParse(value);
  return parsed.success ? parsed.data : "unknown";
}

export function parseSourceScopePolicy(value: unknown): SourceScopePolicy {
  const parsed = sourceScopePolicySchema.safeParse(value);
  return parsed.success ? parsed.data : "soft_source_scope";
}

export function masteryScoreToReadiness(masteryScore: number): LearnerReadinessLevel {
  if (masteryScore < 0.35) return "foundational";
  if (masteryScore < 0.6) return "developing";
  if (masteryScore < 0.8) return "proficient";
  return "advanced";
}

export function inferSourceLevelFromSignals(input: {
  title?: string | null;
  backgroundSummary?: string | null;
  metadata?: Record<string, unknown>;
}): SourceLevelRecord {
  const stored = parseSourceLevel(input.metadata?.sourceLevel);
  if (stored !== "unknown") {
    return {
      sourceId: typeof input.metadata?.sourceId === "string" ? input.metadata.sourceId : "",
      level: stored,
      confidence: 0.9,
      lastUpdatedReason: "stored_source_metadata",
    };
  }

  const haystack = [input.title, input.backgroundSummary].filter(Boolean).join(" ").toLowerCase();
  if (/\b(ph\.?d|doctoral|dissertation|graduate)\b/.test(haystack)) {
    return { sourceId: "", level: "graduate", confidence: 0.72, lastUpdatedReason: "inferred_from_title_or_profile" };
  }
  if (/\b(undergrad|undergraduate|university|calculus ii|linear algebra|college)\b/.test(haystack)) {
    return { sourceId: "", level: "undergraduate", confidence: 0.7, lastUpdatedReason: "inferred_from_title_or_profile" };
  }
  if (/\b(high school|secondary|gcse|a-level|introductory)\b/.test(haystack)) {
    return { sourceId: "", level: "high_school", confidence: 0.7, lastUpdatedReason: "inferred_from_title_or_profile" };
  }
  if (/\b(professional|industry|practitioner|certification)\b/.test(haystack)) {
    return { sourceId: "", level: "professional", confidence: 0.68, lastUpdatedReason: "inferred_from_title_or_profile" };
  }
  return { sourceId: "", level: "unknown", confidence: null, lastUpdatedReason: "no_level_signals" };
}

export function buildConceptLearnerReadiness(input: {
  conceptId: string;
  masteryScore: number;
  confidence: number | null;
}): LearnerReadiness {
  return learnerReadinessSchema.parse({
    targetRef: { refType: "concept", refId: input.conceptId },
    readiness: masteryScoreToReadiness(input.masteryScore),
    evidenceRefs: [{ refType: "learning_state", refId: input.conceptId }],
    confidence: input.confidence,
    lastUpdatedReason: "concept_mastery_snapshot",
  });
}

export function buildSelfReportedLearnerReadiness(input: {
  backgroundSummary: string;
  profileId: string;
}): LearnerReadiness | null {
  const inferred = inferSourceLevelFromSignals({ backgroundSummary: input.backgroundSummary });
  if (inferred.level === "unknown") return null;
  return learnerReadinessSchema.parse({
    targetRef: { refType: "source", refId: "notebook_profile" },
    readiness: inferred.level === "high_school" ? "foundational" : inferred.level === "graduate" ? "advanced" : "developing",
    inferredLevel: inferred.level,
    evidenceRefs: [{ refType: "self_report", refId: input.profileId }],
    confidence: inferred.confidence,
    lastUpdatedReason: "self_reported_background",
  });
}
