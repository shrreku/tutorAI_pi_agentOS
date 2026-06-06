import type { NodeRef } from "./ids.js";
import type {
  SyntheticLearnerAssertionReference,
  SyntheticLearnerRuntimeEvent,
  SyntheticLearnerToolEvent,
} from "./synthetic-learner-evals.js";

export type SyntheticLearnerForbiddenProductStateSnapshot = {
  masteryEvidenceRefs: NodeRef[];
  learningStateRefs: NodeRef[];
  weakConceptRefs: NodeRef[];
  objectiveRefs: NodeRef[];
  curriculumRefs: NodeRef[];
  studyPlanRefs: NodeRef[];
  artifactRefs: NodeRef[];
  sourceGroundingRefs: NodeRef[];
  explicitLearnerGoalRefs: NodeRef[];
  readinessRefs: NodeRef[];
  traitSignalRefs: NodeRef[];
  traitEstimateRefs: NodeRef[];
  personalizationRecommendationRefs: NodeRef[];
};

export type SyntheticLearnerAssertionPersistenceEvidence = {
  masteryEvidence?: Array<{
    ref: NodeRef;
    correctnessLabel?: string;
    overallScore?: number;
    confidence?: number;
    triggerSource?: string;
  }>;
  artifacts?: Array<{
    ref: NodeRef;
    status: string;
  }>;
  sessionEvents?: Array<{
    ref?: NodeRef;
    eventType: string;
    timestamp?: string;
  }>;
  traitRecommendationOnlySnapshot?: {
    before: SyntheticLearnerForbiddenProductStateSnapshot;
    after: SyntheticLearnerForbiddenProductStateSnapshot;
  };
};

export type SyntheticLearnerAssertionEngineInput = {
  assertionRefs: SyntheticLearnerAssertionReference[];
  transcript?: string[];
  tutorMessages?: string[];
  toolEvents?: SyntheticLearnerToolEvent[];
  runtimeEvents?: SyntheticLearnerRuntimeEvent[];
  notebookEvents?: SyntheticLearnerRuntimeEvent[];
  traceRefs?: NodeRef[];
  notebookRefs?: NodeRef[];
  persistence?: SyntheticLearnerAssertionPersistenceEvidence;
  disableRuntimeFallback?: boolean;
};
