import { handleEvidenceSourceSpanOpened } from "./evidence-source-span-opened.js";
import { handleFlashcardReviewRated } from "./flashcard-review-rated.js";
import { handleLivePlanActionSelected } from "./live-plan-action-selected.js";
import { handlePersonalizationPreferenceUpdated } from "./personalization-preference-updated.js";
import { handleQuizAnswerSubmitted } from "./quiz-answer-submitted.js";
import { handleSimulationSubmitted } from "./simulation.js";
import { handleSourceReaderAnnotationCreated } from "./source-reader-annotation-created.js";
import { handleSurfaceCompleted } from "./surface-completed.js";
import { handleTutorHelpRequested } from "./tutor-help-requested.js";
import type { ActionHandlersRegistry } from "./types.js";
import { handleWorkedExampleStepAnswered, handleWorkedExampleStepRevealed } from "./worked-example.js";

export type {
  ActionContext,
  ActionHandler,
  ActionHandlerOutcome,
  ActionHandlerResult,
  ActionHandlersRegistry,
  InteractiveLearningActionError,
} from "./types.js";

export const ACTION_HANDLERS: ActionHandlersRegistry = {
  "quiz.answer_submitted": handleQuizAnswerSubmitted,
  "flashcard.review_rated": handleFlashcardReviewRated,
  "worked_example.step_answered": handleWorkedExampleStepAnswered,
  "worked_example.step_revealed": handleWorkedExampleStepRevealed,
  "simulation.observation_submitted": handleSimulationSubmitted,
  "simulation.parameter_snapshot_submitted": handleSimulationSubmitted,
  "evidence.source_span_opened": handleEvidenceSourceSpanOpened,
  "live_plan.action_selected": handleLivePlanActionSelected,
  "tutor.help_requested": handleTutorHelpRequested,
  "personalization.preference_updated": handlePersonalizationPreferenceUpdated,
  "surface.completed": handleSurfaceCompleted,
  "source_reader.annotation_created": handleSourceReaderAnnotationCreated,
};
