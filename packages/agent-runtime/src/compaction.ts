import { z } from "zod";

export const studyAgentCompactionInputSchema = z.object({
  notebookId: z.string().min(1),
  activeMode: z.string().min(1),
  selectedNodeRefs: z.array(
    z.object({
      refType: z.string().min(1),
      refId: z.string().min(1),
    }),
  ),
  activeConceptIds: z.array(z.string().min(1)).default([]),
  activeObjectiveIds: z.array(z.string().min(1)).default([]),
  latestLearnerMessage: z.string().optional(),
  latestTutorQuestion: z.string().optional(),
  recentCheckpointState: z.record(z.string(), z.unknown()).default({}),
  sourceIds: z.array(z.string().min(1)).default([]),
  citationIds: z.array(z.string().min(1)).default([]),
  currentLearningStateSummary: z.string().optional(),
  openArtifactProposals: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const studyAgentCompactionOutputSchema = studyAgentCompactionInputSchema.extend({
  compressedContext: z.string().min(1),
});

export type StudyAgentCompactionInput = z.infer<typeof studyAgentCompactionInputSchema>;
export type StudyAgentCompactionOutput = z.infer<typeof studyAgentCompactionOutputSchema>;

export function compactStudyAgentContext(input: StudyAgentCompactionInput): StudyAgentCompactionOutput {
  const parsed = studyAgentCompactionInputSchema.parse(input);
  const compressedContext = [
    `notebook=${parsed.notebookId}`,
    `mode=${parsed.activeMode}`,
    parsed.activeConceptIds.length ? `concepts=${parsed.activeConceptIds.join(",")}` : undefined,
    parsed.activeObjectiveIds.length ? `objectives=${parsed.activeObjectiveIds.join(",")}` : undefined,
    parsed.latestLearnerMessage ? `learner=${truncate(parsed.latestLearnerMessage)}` : undefined,
    parsed.latestTutorQuestion ? `tutor=${truncate(parsed.latestTutorQuestion)}` : undefined,
    parsed.currentLearningStateSummary ? `state=${truncate(parsed.currentLearningStateSummary)}` : undefined,
    parsed.sourceIds.length ? `sources=${parsed.sourceIds.join(",")}` : undefined,
    parsed.citationIds.length ? `citations=${parsed.citationIds.join(",")}` : undefined,
    parsed.openArtifactProposals.length ? `artifacts=${parsed.openArtifactProposals.length}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    ...parsed,
    compressedContext,
  };
}

function truncate(value: string, max = 120): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}