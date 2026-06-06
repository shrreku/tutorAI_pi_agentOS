export type DetectedIntent = {
  type: "teach_me" | "help_me_with" | "continue" | "start_studying" | "explore" | "none";
  keyword: string | null;
};

export function detectLearnerIntent(message: string): DetectedIntent {
  const lower = message.toLowerCase().trim();

  const keywords = [
    { pattern: /teach\s+me|explain\s+(?:to\s+)?me|teach\s+(?:me\s+)?about/, type: "teach_me" as const, keyword: "teach me" },
    {
      pattern: /help\s+(?:me\s+)?with|stuck\s+(?:on\s+)?|i.*don[\'\"]?t.*understand|confused/,
      type: "help_me_with" as const,
      keyword: "help me with",
    },
    { pattern: /continue|next|what[\'\"]?s\s+next|keep\s+going|next\s+step/, type: "continue" as const, keyword: "continue" },
    { pattern: /resume|pick\s+up\s+where\s+we\s+left\s+off|carry\s+on/, type: "continue" as const, keyword: "continue" },
    {
      pattern: /start\s+(?:studying|learning)|begin|let[\'\"]?s\s+start|ready\s+to\s+(?:learn|study)/,
      type: "start_studying" as const,
      keyword: "start studying",
    },
    {
      pattern: /explore|browse|overview|show\s+me\s+around|map\s+of/,
      type: "explore" as const,
      keyword: "explore",
    },
  ];

  for (const { pattern, type, keyword } of keywords) {
    if (pattern.test(lower)) {
      return { type, keyword };
    }
  }

  return { type: "none", keyword: null };
}

export type LearnerTurnGoal =
  | "mastery_answer"
  | "quiz_or_artifact"
  | "lesson_opening"
  | "artifact_followup"
  | "none";

export function detectLearnerTurnGoal(message: string): LearnerTurnGoal {
  const lower = message.toLowerCase().trim();
  if (/\bquiz\b|\bflashcard/.test(lower) || /\bmake me a\b.*\b(study|quiz|flashcard)/.test(lower)) {
    return "quiz_or_artifact";
  }
  if (
    /\b(is that|was that|am i|are we)\b.*\b(right|correct)\b/.test(lower)
    || /\bcorrection\b/.test(lower)
    || /\btangent\b/.test(lower)
    || /\bsecant\b/.test(lower)
    || /\bslope\b/.test(lower)
    || /\bmixing\b/.test(lower)
  ) {
    return "mastery_answer";
  }
  if (/\brevision\b|\btied to the source\b|\buseful for revision\b|\bkeep it tied\b/.test(lower)) {
    return "artifact_followup";
  }
  if (
    /\bteach me\b/.test(lower)
    || /\bmissing a key idea\b/.test(lower)
    || /\bhelp me understand\b/.test(lower)
    || /\bwhere i (went|go) wrong\b/.test(lower)
    || /\bunsure about\b/.test(lower)
    || /\bconfused\b/.test(lower)
  ) {
    return "lesson_opening";
  }
  return "none";
}

export function buildLearnerTurnRoutingInstruction(
  goal: LearnerTurnGoal,
  hasPendingMasteryCheck: boolean,
): string | null {
  switch (goal) {
    case "mastery_answer":
      return hasPendingMasteryCheck
        ? "The learner is answering your prior mastery checkpoint. Evaluate their answer with learning.evaluate_response (or rely on runtime auto-evaluation if already triggered) before moving on. Do not reply with only a generic greeting."
        : "The learner is giving a concept answer or correction. Ask a short checkpoint question if needed, then evaluate with learning.evaluate_response when they provide an answer worth scoring.";
    case "quiz_or_artifact":
      return "The learner requested a study artifact. Call the appropriate artifact tool (for example artifact.create_quiz) grounded in notebook sources. Do not reply with only a generic greeting.";
    case "artifact_followup":
      return "The learner wants a source-grounded revision artifact. Use notebook.get_context and wiki.search if needed, then create or refine the requested artifact. Do not reply with only a generic greeting.";
    case "lesson_opening":
      return "The learner asked for foundational help. Teach from the active objective with source grounding and include a checkpoint question that invites their own explanation.";
    default:
      return null;
  }
}

export function buildIntentRoutingInstruction(intent: DetectedIntent, hasCurrentObjective: boolean, currentObjectiveTitle?: string): string | null {
  if (intent.type === "none" || !hasCurrentObjective || !currentObjectiveTitle) {
    return null;
  }

  switch (intent.type) {
    case "teach_me":
      return `The learner said "${intent.keyword}" and you have an active curriculum objective: "${currentObjectiveTitle}". Begin teaching this objective directly rather than asking what they want to learn. Orient them to the objective, provide key concepts with source evidence, and check for understanding. Keep the first response focused and inviting.`;
    case "help_me_with":
      return `The learner said "${intent.keyword}" and you have an active objective: "${currentObjectiveTitle}". Use this as context: they may be stuck on related concepts. Start by acknowledging their request, then connect it to the current objective path. Offer targeted help on weak concepts or clarifications within the objective scope.`;
    case "continue":
      return `The learner said "${intent.keyword}" and you have an active objective: "${currentObjectiveTitle}". Continue directly from where you left off or from the next step in the current objective. Do not ask what they want to learn; assume they want to progress on this objective.`;
    case "start_studying":
      return `The learner said "${intent.keyword}" and you have an active objective: "${currentObjectiveTitle}". Begin a focused session on this objective. Start with a brief orientation, then engage them with the first key concept or scaffolding step from the objective.`;
    case "explore":
      return `The learner asked to "${intent.keyword}" while an active objective exists: "${currentObjectiveTitle}". Give a concise objective-centered map: what the objective covers, key prerequisite concepts, and the next best starting step. Keep exploration grounded in the active curriculum path.`;
    default:
      return null;
  }
}