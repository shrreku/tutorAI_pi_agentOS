import {
  buildLearnerProgressSummary,
  formatLearnerProgressSummaryText,
  type LearnerProgressSummary,
} from "@studyagent/schemas";
import type { NotebookStudyState } from "./study-state.js";

export function deriveLearnerProgressSummary(state: NotebookStudyState): LearnerProgressSummary {
  const weakById = new Map((state.studyPlan?.weakConcepts ?? []).map((concept) => [concept.id, concept.name]));
  const readinessLabels = (state.learnerReadiness ?? [])
    .filter((entry) => entry.targetRef.refType === "concept")
    .map((entry) => ({
      conceptName: weakById.get(entry.targetRef.refId) ?? entry.targetRef.refId,
      readiness: entry.readiness,
    }));

  return buildLearnerProgressSummary({
    weakConcepts: state.studyPlan?.weakConcepts ?? [],
    coverageGapTitles: state.coverage.gaps.map((gap) => gap.title),
    currentObjectiveTitle: state.studyPlan?.currentObjective?.title ?? null,
    completedObjectiveCount: state.studyPlan?.completedObjectives.length ?? 0,
    readinessLabels,
  });
}

export function formatLearnerProgressForDigest(state: NotebookStudyState): string | undefined {
  const summary = deriveLearnerProgressSummary(state);
  const text = formatLearnerProgressSummaryText(summary);
  return text.length > 0 ? text : undefined;
}

export function learnerProgressExposesRawEvaluatorData(summary: LearnerProgressSummary): boolean {
  const blob = JSON.stringify(summary);
  return /\b(score|delta|confidence|uncertainty|0\.\d{2,})\b/i.test(blob);
}
