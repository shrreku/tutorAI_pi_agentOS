import { z } from "zod";

export const learnerProgressSummarySchema = z.object({
  headline: z.string().min(1).optional(),
  strengths: z.array(z.string().min(1)).default([]),
  weakConcepts: z.array(z.string().min(1)).default([]),
  needsReview: z.array(z.string().min(1)).default([]),
  readyToAdvance: z.array(z.string().min(1)).default([]),
});

export type LearnerProgressSummary = z.infer<typeof learnerProgressSummarySchema>;

export type LearnerProgressSummaryInput = {
  weakConcepts: Array<{ id: string; name: string }>;
  coverageGapTitles: string[];
  currentObjectiveTitle?: string | null;
  completedObjectiveCount: number;
  readinessLabels: Array<{ conceptName: string; readiness: string }>;
};

export function buildLearnerProgressSummary(input: LearnerProgressSummaryInput): LearnerProgressSummary {
  const strengths: string[] = [];
  const weakConcepts = input.weakConcepts.slice(0, 4).map((concept) => concept.name);
  const needsReview = input.coverageGapTitles.slice(0, 4);
  const readyToAdvance: string[] = [];

  for (const entry of input.readinessLabels) {
    if (entry.readiness === "proficient" || entry.readiness === "advanced") {
      readyToAdvance.push(entry.conceptName);
    } else if (entry.readiness === "developing" && !weakConcepts.includes(entry.conceptName)) {
      strengths.push(entry.conceptName);
    }
  }

  if (input.completedObjectiveCount > 0 && input.currentObjectiveTitle) {
    readyToAdvance.push(input.currentObjectiveTitle);
  }

  const headlineParts: string[] = [];
  if (weakConcepts.length) headlineParts.push(`Focus on ${weakConcepts.slice(0, 2).join(" and ")}`);
  if (needsReview.length) headlineParts.push(`${needsReview.length} topic${needsReview.length === 1 ? "" : "s"} need review`);
  if (!headlineParts.length && readyToAdvance.length) headlineParts.push("You are ready to advance");
  if (!headlineParts.length && strengths.length) headlineParts.push("Building momentum on core concepts");

  return learnerProgressSummarySchema.parse({
    ...(headlineParts.length ? { headline: headlineParts.join("; ") } : {}),
    strengths: [...new Set(strengths)].slice(0, 4),
    weakConcepts,
    needsReview,
    readyToAdvance: [...new Set(readyToAdvance)].slice(0, 4),
  });
}

export function formatLearnerProgressSummaryText(summary: LearnerProgressSummary): string {
  const parts: string[] = [];
  if (summary.headline) parts.push(summary.headline);
  if (summary.strengths.length) parts.push(`Strengths: ${summary.strengths.join(", ")}`);
  if (summary.weakConcepts.length) parts.push(`Needs practice: ${summary.weakConcepts.join(", ")}`);
  if (summary.needsReview.length) parts.push(`Review: ${summary.needsReview.join(", ")}`);
  if (summary.readyToAdvance.length) parts.push(`Ready to advance: ${summary.readyToAdvance.join(", ")}`);
  return parts.join(" | ");
}
