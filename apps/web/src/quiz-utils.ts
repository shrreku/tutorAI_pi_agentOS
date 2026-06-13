export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: string[];
  answer: string | null;
  referenceAnswer: string | null;
  explanation: string | null;
  difficulty: string | null;
  conceptIds: string[];
};

export function normalizeQuizQuestions(value: unknown): QuizQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): QuizQuestion | null => {
      if (typeof item !== "object" || item === null) return null;
      const record = item as Record<string, unknown>;
      const choices = Array.isArray(record.choices)
        ? record.choices.map((choice) => String(choice)).filter(Boolean)
        : Array.isArray(record.options)
          ? record.options.map((choice) => String(choice)).filter(Boolean)
          : [];
      const rawPrompt = stringValue(
        record.prompt ?? record.question ?? record.title ?? record.problem,
      );
      const prompt = rawPrompt ? stripEmbeddedChoices(rawPrompt, choices) : null;
      if (!prompt) return null;
      const conceptIds = Array.isArray(record.conceptIds)
        ? record.conceptIds.filter((id): id is string => typeof id === "string")
        : typeof record.conceptId === "string"
          ? [record.conceptId]
          : [];
      const upgraded = maybeUpgradeGenericQuizQuestion(record, prompt, choices, index);
      if (upgraded) {
        return {
          id: stringValue(record.id ?? record.questionId) ?? `q_${index + 1}`,
          ...upgraded,
          conceptIds,
        };
      }
      return {
        id: stringValue(record.id ?? record.questionId) ?? `q_${index + 1}`,
        prompt,
        choices,
        answer: stringValue(record.answer ?? record.correctAnswer),
        referenceAnswer: stringValue(record.referenceAnswer),
        explanation: stringValue(record.explanation),
        difficulty: stringValue(record.difficulty),
        conceptIds,
      };
    })
    .filter((question): question is QuizQuestion => Boolean(question));
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function maybeUpgradeGenericQuizQuestion(
  record: Record<string, unknown>,
  prompt: string,
  choices: string[],
  index: number,
): Omit<QuizQuestion, "id" | "conceptIds"> | null {
  if (choices.length > 0) return null;
  const match = prompt.match(/^how would you explain\s+(.+?)\s+in your own words\??$/i);
  if (!match) return null;

  const conceptName = match[1]?.trim() || "this concept";
  const reference =
    stringValue(
      record.referenceAnswer ?? record.answer ?? record.correctAnswer ?? record.explanation,
    ) ?? `${conceptName} should be connected to source evidence and the current practice goal`;
  const answer = stripTrailingPeriod(reference);

  return {
    prompt:
      index % 2 === 0
        ? `Which statement best describes ${conceptName}?`
        : `What is the main role of ${conceptName} in this material?`,
    choices: [
      answer,
      "It is only a vocabulary label and does not affect problem solving.",
      "It means the same thing as every other concept in the quiz.",
      "It should be memorized without connecting it to source evidence.",
    ],
    answer,
    referenceAnswer: answer,
    explanation:
      stringValue(record.explanation) ?? `${conceptName}: ${stripTrailingPeriod(reference)}`,
    difficulty: index % 2 === 0 ? "recall" : "application",
  };
}

function stripEmbeddedChoices(prompt: string, choices: string[]): string {
  if (choices.length === 0) return prompt;
  const byLetter = prompt.match(/\s+a[).]\s+/i);
  if (byLetter?.index && byLetter.index > 0) {
    return prompt.slice(0, byLetter.index).trim();
  }
  const firstChoice = choices[0]?.trim();
  if (firstChoice) {
    const firstChoiceIndex = prompt.toLowerCase().indexOf(firstChoice.toLowerCase());
    if (firstChoiceIndex > 0) {
      return prompt
        .slice(0, firstChoiceIndex)
        .replace(/\s*[a-d][).]?\s*$/i, "")
        .trim();
    }
  }
  return prompt;
}

function stripTrailingPeriod(value: string): string {
  return value.trim().replace(/[.。]\s*$/, "");
}
