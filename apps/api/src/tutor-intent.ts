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